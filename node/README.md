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

| Phase | Modules | Status |
|---|---|---|
| 1 | Foundation + Auth + Payout reference module | done |
| 2 | Profile, VerifyEmail, Subuser, Settings, StaticPages, Lookups | done |
| 3 | Onboarding (multi-step), VirtualAccount, BeneficiaryAccounts | done |
| 4 | Senders, Quotes, Wallet (+ WalletTransactions) | done |
| 5 | Deposits, Ledger (full bankBalance loop closed) | done |
| 6 | BeneficiaryTransaction full surface (list, show, cancel, retry, direct, instant, bulk, export, request-proof, get-proof) | done |
| 7 | TeamMembers - all duplicates of the user-side controllers under TeamMembers/* | done |
| 8a | External services - core (HTTP foundation, Telegram, ProcessingUnit, Compliance, Massive, Caliza, FvBank, Diginine) | done |
| 8b | External services - rest (KYC: Sumsub/Incode/Surepass, ViyonaPay, InvoiceMate, HeraldSumsub) | pending |
| 8c | Excel import + PDF/Excel exports + Mail transport + multer file-upload | pending |
| 9 | Webhooks (Caliza, Diginine, FvBank, Compliance, ProcessingUnit) | pending |
| 10 | Admin / Treasury / Support consoles, Reports, Exports, Imports | pending |

### Phase 2 deferred items

A few branches inside Phase 2 controllers depend on later phases - they
return a clean 501 or a minimal payload now and will be filled in when the
underlying module lands:

* `lookups/refresh-rates` -> needs Massive quote provider (Phase 8)
* `lookups/get-rates` per-merchant commission overlay -> needs MerchantFee/Quote (Phase 4)
* `profile/check_user_status` KYC re-poll -> needs KycFactory (Phase 8)
* `profile/update_profile` multipart uploads -> currently base64-only; multer wired in Phase 4

### Phase 3 deferred items

* `accounts/activate` -> records UserService(INITIATED) + logs intent. Actual
  Caliza/FvBank HTTP onboarding + virtual-account provisioning lands in
  Phase 8; the accompanying webhook handlers (which populate
  `virtual_accounts` rows) land in Phase 9.
* `accounts/balances` and `bankBalance` use a partial computation
  (BeneficiaryTransaction debits only). Full balance (DepositTransaction +
  WalletTransaction credit/debit + per-merchant commission overlay) is
  re-enabled when DepositTransaction (Phase 5) and WalletTransaction
  (Phase 4) are ported.
* `beneficiaries/validate_account` returns cached results from the
  `beneficiary_account_validations` table; on cache miss it returns 501
  (the ProcessingUnit external service lands in Phase 8).
* `beneficiaries/bulk/template` and `beneficiaries/bulk/store` return 501;
  Excel import/export (`maatwebsite/excel` equivalent) lands in Phase 8.
* `onboarding/stepThree` records the document and KYC intent; the actual
  KYC provider HTTP handoff (Sumsub / Incode / Surepass) lands in Phase 8.
* `FieldsHelper::beneficiary_form_fields` is ported in a simplified form
  that covers the canonical USD + non-USD branches. The full per-country
  rule overlay (lookup-driven `country_configurations` + per-merchant
  field whitelists) lands alongside the lookup ingestion job in Phase 8.

### Phase 4 deferred items

* `quotes/store` cross-currency path requires the Massive provider
  (Phase 8). Same-currency virtual-account quotes and wallet quotes are
  fully functional now (no external HTTP, transaction-fee path executes).
* `wallets/convert` writes a Ledger row via the polymorphic
  `transaction_type` + `transaction_id` pattern but without the full
  refund chain - that lands in Phase 5 alongside DepositTransaction.
* `senders/bulk/template` and `senders/bulk/store` -> 501 (Phase 8 Excel).
* The AED -> INR rate override (env('USD_TO_AED') from Laravel
  QuoteRepository) lives behind the Massive driver path and re-enables
  in Phase 8 with the rest of the AED handling.

### Phase 5 deferred items

* `bankBalance` is now fully end-to-end:
    deposits (COMPLETED, scoped by memo for PAYINCOLLECTION merchants)
    - direct beneficiary debits
    - quote-routed beneficiary debits
    - wallet credits via the source quote.
* `deposits/store` records the row + status history immediately and logs
  the ProcessingUnit + InvoiceMate + Telegram dispatch intent. The actual
  external HTTP calls land in Phase 8; the corresponding deposit-completion
  webhook handlers land in Phase 9.
* `deposits/retry_deposit` rotates `order_id` and resets status to
  PROCESSING_UNIT_INITIATED; the redispatch is wired in Phase 8.
* `deposits/export` and `ledgers/export` -> 501 (PDF/Excel via Phase 8).
* `LedgerRepository`'s polymorphic `whereHasMorph` is replaced with an
  explicit candidate-id JOIN; behaviour is identical and the search-key
  match performs better at scale.

### Phase 7 deferred items

* `team/dashboard/statistics` and `team/dashboard/charts-data` -> 501;
  the DashboardRepository port lands alongside the admin/treasury console
  in Phase 10.
* CORPORATE-role data scoping (filter list responses by team_member_id)
  is wired through `req.teamMember` but the underlying Phase 4-6 list
  services apply it as their downstream operations are extended; the
  visible behaviour today: OWNER and TEAM_MEMBER see the full
  business-user dataset, CORPORATE sees the same. The narrowing layer
  lands once the bulk-payout worker (Phase 8) is in.
* Team forgot-password notification email is logged-only - the actual
  TeamAuthEmailService transport lands when the Mail subsystem is
  ported.
* `team/get-credentials` returns an unencrypted RSA private key
  exactly once (mirror of Laravel) and stores envelope-encrypted copies
  for future re-fetch through the user-side flow. SOC auditors will
  want to verify the client-side never round-trips it back.

### Phase 6 deferred items

* `beneficiary-transactions/store|direct` external dispatch chain
  (Compliance -> ProcessingUnit -> Caliza/Diginine/FvBank) lands in
  Phase 8; the worker currently transitions APPROVED/INITIATED -> PROCESSING
  + writes the audit row + bookkeeping ledger.
* `beneficiary-transactions/instant/store` and `bulk/store` enqueue a
  PayoutJob carrying the entire row payload; the worker that materialises
  Quote + BeneficiaryAccount + Sender + BeneficiaryTransaction lands in
  Phase 8 alongside the external service drivers.
* `beneficiary-transactions/export` (PDF receipt) and `download` (bulk
  PDF/Excel) and `bulk/template` -> 501 (Phase 8 mpdf/excel).
* `retry_external_service` for COMPLIANCE_INITIATION_FAILED transitions is
  logged-only; the actual ComplianceService::make call lands in Phase 8.
* Polymorphic refund chain (`createRefund` for cancel + reject) is fully
  wired and writes back into Wallet (credit) or DepositTransaction (refund
  type) + Ledger; downstream notifications (Telegram, callbacks) land in
  Phases 8/9.

### Phase 8a deferred items

* **KYC providers (Sumsub, Incode, Surepass)** - the `onboarding/stepThree`
  KYC handoff still returns `id_verification_url: null`; the providers
  themselves are not yet ported. Phase 8b ports the KycFactory.
* **InvoiceMate** - `Helper::notifyAccounts` / `SendToInvoiceMateJob` are
  still no-ops. Phase 8b ports both the InvoiceMate client and the
  BullMQ worker that fans out deposit + payout events to it.
* **ViyonaPay, HeraldSumsub** - rare-corridor providers; ported in 8b.
* **Excel import + PDF/Excel exports** - all `bulk/template`, `bulk/store`,
  `export`, `download_list` endpoints still return 501. Phase 8c brings
  in `xlsx`/`exceljs` for import and `pdfkit`/`puppeteer` for receipt
  rendering. The bulk-payout queue worker stub also lands then; its
  Phase 6 enqueue path is fully wired and waiting.
* **Mail transport** - `UserAuthEmailService.*` and `TeamAuthEmailService.*`
  still log instead of sending email. Phase 8c wires nodemailer +
  SES/Mailgun via the queue.
* **multer file uploads** - all binary uploads currently use base64 data
  URLs only. Phase 8c adds true multipart with multer.
* **Caliza VirtualAccount synchronous response** - the driver writes the
  account anchor row to PENDING and only flips to CREATED if the
  provider returned `account_number` synchronously (sandbox does;
  production returns it via webhook in Phase 9).
* **AED -> INR rate override** that Laravel applies in the QuoteRepository
  hot-path is not yet replicated; the Massive driver returns the raw
  rate and the controller leaves the override for the AED corridor as a
  pending fix.

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
