# Eficyent API (Node / TypeScript)

Node 22 + TypeScript port of the Laravel API located at `../Laravel`.

This directory contains the **Phase 1 foundation**: production-grade scaffold,
security middleware, AWS Secrets Manager + KMS integration, opaque-token auth
with Redis sessions, idempotency for payout flows, BullMQ queues + crons, and
two reference module conversions (Auth + BeneficiaryTransaction.payout).

The remaining controllers/services from the Laravel codebase will be ported
incrementally on top of this foundation. See [Migration roadmap](#migration-roadmap)
below.

---

## Project layout

```
src/
  index.ts             # API entrypoint (HTTP server)
  worker.ts            # Worker entrypoint (BullMQ workers + crons)

  config/              # env, AWS Secrets Manager, KMS, redis
  db/                  # Prisma client wrapper
  helpers/             # logger, response envelope, errors, crypto, constants
  middleware/          # auth, rate limit, idempotency, security, error handler
  routes/              # route registration -> controllers
  controllers/         # request handling (no SQL, no external HTTP)
  validators/          # zod schemas, one file per controller group
  services/            # business logic (auth, email, external integrations)
  repositories/        # data access wrappers around Prisma
  queues/              # queue + dispatcher + cron definitions
  workers/             # job handlers (payout, callback, fx-rates, etc.)

prisma/schema.prisma   # generated from Laravel migrations
```

A request to a payout endpoint flows:

```
HTTP -> security/cors/rate-limit -> auth -> idempotency -> validate -> controller
                                                              |
                                            repository (Prisma) + service (BullMQ)
                                                              |
                                                       BullMQ worker
                                                              |
                                                External service (Caliza/Diginine/...)
```

---

## Production deployment - build folder only

The Dockerfile is a multi-stage build whose final image contains **only**:

* `dist/` (compiled JavaScript)
* `node_modules/` (production dependencies only - `npm prune --omit=dev`)
* `package.json` (for runtime metadata)
* `prisma/` (Prisma engine + schema)

`src/`, `tsconfig*.json`, `tests/`, devDependencies, and source maps for
non-shipped code are not present in the runtime image. The container also runs
as a non-root `app` user.

Build:

```bash
docker build -t eficyent-api .
```

The image's default `CMD` runs the API. Workers run in a separate container:

```bash
docker run --rm eficyent-api node dist/worker.js
```

In ECS/EKS this maps to two services or two task definitions sharing the same
image but different command overrides.

---

## AWS Secrets Manager + KMS

All sensitive configuration is loaded from AWS Secrets Manager at process start
by `src/config/secrets.ts`. The only env vars required to bootstrap are:

* `AWS_REGION`
* `KMS_KEY_ID` (CMK alias)
* `SECRET_ID_*` (one per secret bundle - see `.env.example`)

### Proposed secret naming convention

| Secret ID | Purpose |
|---|---|
| `eficyent/<env>/app` | App key, request signing secret, FvBank webhook secret |
| `eficyent/<env>/db` | DB host/port/user/pass/db |
| `eficyent/<env>/redis` | Redis host/port/auth/tls |
| `eficyent/<env>/auth` | TOKEN_PEPPER, PASSWORD_PEPPER, SIGNATURE_SECRET, MERCHANT_SIGNATURE_SECRET |
| `eficyent/<env>/aws` | S3 bucket + region (non-credential) |
| `eficyent/<env>/mail` | SMTP/SES creds |
| `eficyent/<env>/external/<provider>` | One bundle per provider (caliza, diginine, fvbank, ...) |

`<env>` is one of `production`, `staging`, `sandbox`, `dev`.

### KMS at-rest encryption

Use `src/config/kms.ts` envelope encryption for any column the SOC audit
considers sensitive:

* `users.tfa_secret`
* `users.private_key`, `users.public_key`, `users.salt_key`
* External service tokens (`external_service_calls.request_payload` if it
  contains card data, etc.)

The CMK is referenced by alias only - `alias/eficyent/<env>/app` - so key
rotation policy is enforced in KMS, not application code. EC2/ECS/EKS task
roles must be granted `kms:Encrypt`, `kms:Decrypt`, `kms:GenerateDataKey`
on this CMK, plus `secretsmanager:GetSecretValue` on the secret IDs above.

### IAM (least privilege)

Workers and API may share the same role; minimum required policy:

```json
{
  "Effect": "Allow",
  "Action": ["secretsmanager:GetSecretValue"],
  "Resource": "arn:aws:secretsmanager:<region>:<account>:secret:eficyent/<env>/*"
},
{
  "Effect": "Allow",
  "Action": ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"],
  "Resource": "arn:aws:kms:<region>:<account>:key/<cmk-uuid>"
}
```

---

## Auth - opaque tokens + Redis sessions

`src/services/auth/tokenService.ts` and `sessionService.ts` together replace
Laravel Sanctum.

* **Token format**: `<id>|<random>` where `<random>` is `TOKEN_BYTES` of CSPRNG
  output. Only the HMAC-SHA-256 fingerprint of `<random>` (peppered with
  `TOKEN_PEPPER` from Secrets Manager) is stored in `personal_access_tokens`.
* **Session in Redis**: every issued token has a `sess:{userId}:{tokenId}` key
  with a sliding inactivity TTL plus an absolute expiry floor. Logout deletes
  the row + the Redis key.
* **2FA**: TOTP via `otpauth` (Google Authenticator-compatible). The
  `tfa_secret` column is envelope-encrypted under the KMS CMK.

Password hashing is Argon2id (replaces bcrypt). On first successful login,
existing bcrypt hashes from the Laravel side are transparently rehashed.

---

## Idempotency for payout APIs

`src/middleware/idempotency.ts` enforces an `Idempotency-Key` header on
mutating payout endpoints. Backed by Redis (hot) + a durable `idempotency_keys`
table (cold replay).

* First call - claim key (Redis SETNX), execute handler, capture & persist response.
* Replay with same body hash - return captured response (`Idempotent-Replayed: true`).
* Replay with different body hash - 409 Conflict.
* Replay while still in flight - 425 Too Early.
* Auto-expiry: `IDEMPOTENCY_TTL_SECONDS` (default 24h).

Defense in depth - the BullMQ payout job also uses `jobId = "payout:{txnId}"`
so duplicate enqueues collapse into one execution even if the API layer is
bypassed.

---

## BullMQ - queues, workers, crons

* Queues defined in `src/queues/queues.ts`.
* Type-safe dispatchers in `src/queues/dispatchers.ts`.
* Workers in `src/workers/index.ts`, handlers under `src/workers/handlers/`.
* Crons in `src/queues/cron.ts` - schedules read from env vars
  (`CRON_FX_RATES`, `CRON_CHECK_BENEFICIARY_TXN_STATUS`, ...).

Concurrency per queue is configured by env (`BULLMQ_<QUEUE>_CONCURRENCY`).
A worker process exposes all registered queues; you run as many worker
processes as you need - BullMQ handles distributed job consumption via Redis.

For 1M users:

* Run the API as a fleet behind an ALB (start at 4-8 nodes; horizontal scale
  on CPU).
* Run the worker as a separate fleet (start at 4 nodes, scale on queue depth).
* MySQL: provision with at least 2 read replicas for read-heavy endpoints
  (lookups, transactions list). Prisma supports replica routing via
  `directUrl`/middleware in a follow-up phase.
* Redis: provision a managed instance (ElastiCache) with multi-AZ, 4-8 GiB.

---

## Security hardening checklist

* [x] Helmet (HSTS, CSP, frameguard, noSniff, etc.)
* [x] Strict CORS allowlist (no `*`)
* [x] Rate limiting (Redis-backed, per-user + per-IP, two presets)
* [x] Body size cap, slow-request timeout, slowloris (header/request/keep-alive timeouts)
* [x] Input validation everywhere (zod, `.strict()` to block mass assignment)
* [x] Argon2id password hashing with peppering
* [x] Opaque tokens with peppered SHA-256 fingerprint
* [x] Redis-backed session inactivity + absolute TTL
* [x] TOTP 2FA, with KMS-encrypted secrets
* [x] Idempotency on payout/withdraw mutations
* [x] Structured logging with PII / token redaction
* [x] Build-only production image, non-root user
* [x] AWS Secrets Manager bootstrap, no plaintext secrets in env
* [ ] WAF rules at ALB / CloudFront (deploy-time, not in this repo)
* [ ] Per-merchant request signing for white-label callbacks - lands when
      Callbacks/* services are ported.
* [ ] Pen-test items raised by the audit team.

---

## Migration roadmap

Phase 1 (this PR) ships the foundation + reference modules. Subsequent
phases port the remaining Laravel controllers/services in dependency order:

| Phase | Modules |
|---|---|
| 2 | Profile, VerifyEmail, Subuser, Settings, StaticPages, Lookups |
| 3 | Onboarding (multi-step), VirtualAccount, BeneficiaryAccounts |
| 4 | Senders, Quotes, Wallet (+ WalletTransactions) |
| 5 | Deposits (incl. webhook intake), Ledger |
| 6 | BeneficiaryTransaction full surface (list, show, cancel, retry, direct, instant, bulk, export, request-proof, get-proof) |
| 7 | TeamMembers - all duplicates of the user-side controllers under TeamMembers/* |
| 8 | External services (Caliza, Diginine, FvBank, Massive, ProcessingUnit, Compliance, Remittance, Surepass, Incode, ViyonaPay, InvoiceMate, Telegram, HeraldSumsub) |
| 9 | Webhooks (Caliza, Diginine, FvBank, Compliance, ProcessingUnit) |
| 10 | Admin / Treasury / Support consoles, Reports, Exports, Imports |

Each phase keeps API contracts byte-stable and is deployable independently
behind a feature flag.

---

## Local development

```bash
cp .env.example .env       # fill in values OR rely on Secrets Manager
docker compose up -d       # mysql + redis
npm install
npx prisma generate
npx prisma migrate dev     # if you have access to a migrations folder
npm run dev                # API (tsx watch)
npm run dev:worker         # worker
```

For production:

```bash
npm run build
node dist/index.js         # API
node dist/worker.js        # worker
```
