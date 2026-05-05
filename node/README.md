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
* [ ] Per-merchant request signing for white-label callbacks - the
      Callbacks/* dispatcher is ported (Phase 9). Signing is gated
      behind merchant readiness; the salt_key column is in place so
      enabling it is one-line in `merchantCallbackDispatcher.ts`.
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
| 8b | External services - rest (KYC: HeraldSumsub + Incode + Surepass validation, ViyonaPay, InvoiceMate) | done |
| 8c | Excel import + PDF/Excel exports + Mail transport + multer file-upload + AED override | done |
| 9 | Webhooks (Caliza, Diginine, FvBank, Compliance, ProcessingUnit) + merchant callback dispatcher | done |
| 10 | Dashboards (user + team) + ComplianceAlign + RemittanceAlign + Reports microservice client | done |

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
* `senders/bulk/template` and `senders/bulk/store` -> delivered in Phase 8c.
* The AED -> INR rate override (env('USD_TO_AED') from Laravel
  QuoteRepository) -> delivered in Phase 8c via
  `services/quotes/aedOverride.ts`.

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
* `deposits/export` and `ledgers/export` -> delivered in Phase 8c
  (PDF/Excel via `services/exports/*`).
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
* Team forgot-password notification email -> delivered in Phase 8c
  (`services/email/teamAuthEmailService.ts` over nodemailer).
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
  PDF/Excel) and `bulk/template` -> delivered in Phase 8c
  (`services/exports/pdfReceipt.ts` + `excelImportService.ts`).
* `retry_external_service` for COMPLIANCE_INITIATION_FAILED transitions is
  logged-only; the actual ComplianceService::make call lands in Phase 8.
* Polymorphic refund chain (`createRefund` for cancel + reject) is fully
  wired and writes back into Wallet (credit) or DepositTransaction (refund
  type) + Ledger; downstream notifications (Telegram, callbacks) land in
  Phases 8/9.

### Phase 8b deferred items

* **Sumsub native** - the upstream Laravel code uses HeraldSumsub (a
  Sumsub-relay product) rather than direct Sumsub. The HeraldSumsub
  driver is ported here; native Sumsub would only be needed if you
  switch from Herald.
* **Caliza VirtualAccount synchronous response** - the driver writes the
  account anchor row to PENDING and only flips to CREATED if the
  provider returned `account_number` synchronously (sandbox does;
  production returns it via webhook in Phase 9).

### Phase 10 (delivered)

Phase 10 is the final piece: dashboards, operator-triggered batch
jobs, and the Reports microservice integration that closes out the
SendDebitNotification flow Phase 9 stubbed.

* **Dashboards** - `GET /user/dashboard/statistics` and
  `/charts-data` (and the team-side mirrors `/team/dashboard/...`)
  ported byte-stable. Both endpoints flow through
  `services/dashboards/dashboardService.ts`:
  - `statistics()` returns total + today buckets keyed by status
    (success / failed / pending / rejected) with the same
    `formatted_amount` envelope ("$ 1234.56") via `Setting::get`.
  - `chartsData()` returns last-N-day amount buckets + per-status
    counts in the exact Laravel JSON shape.
  - CORPORATE-role narrowing scopes results to the team-member's own
    transactions when invoked via the team route.
  - Optional `bank_account_id` / `wallet_id` filters resolve through
    `quote.source_id`; passing both returns zero rows (matches
    Laravel's `whereHas` semantics exactly).
* **ComplianceAlign + RemittanceAlign** - public operator endpoints
  (`POST /compliance/align`, `POST /stable-coin-remittance/align`)
  enqueue a batch job and return 200 immediately:
  - `complianceBatchHandler` walks
    `beneficiary_transactions WHERE compliance_data IS NULL` and
    runs `Compliance.make(txn, user, false)` against each, sleeping
    between rows (settings: `compliance_transactions_limit`,
    `compliance_batch_sleep_ms`).
  - `remittanceBatchHandler` mirrors that flow against
    `remittance_data` using the new `Remittance` external service.
* **Remittance external service** (`services/external/remittance.ts`)
  ports the C2C / B2B payload split (with UBO ownership_percentage
  rebalancing for businesses) and posts to Herald's
  `/api/v1/initiate_withdrawal`. Provider response is persisted into
  `beneficiary_transactions.remittance_data` so the batch job skips
  already-processed rows.
* **Reports microservice client** (`services/reports/reportClient.ts`
  + `debitNotification.ts`) - shared header-keyed auth client that
  routes through the audited httpClient (full
  `external_service_calls` audit trail). The Phase 9
  `debitNotificationHandler` stub is now wired to call
  `api/debit_transactions` with the ViyonaPay / Diginine payload
  shapes from Laravel SendDebitNotification (including the AED
  wallet-currency override for Diginine).
* **Schema** - `BeneficiaryTransaction.remittanceData` JSON column
  added to mirror the Laravel migration.
* **New BullMQ queues** - `compliance-transactions-batch`,
  `stable-coin-remittance-batch` with env-tunable concurrency.

### Phase 10 deferred items

* **ProcessingUnit::sync()** - the Laravel ExecuteComplianceBatchJob
  also calls `ProcessingUnit::sync()` for transactions that have
  passed compliance. The compliance side of the batch is ported; the
  PU sync RPC depends on `BeneficiaryTransactionService::sync()`
  which is a wider piece of the BeneficiaryTransaction surface that
  hasn't been needed for any user-facing endpoint to date. Logged as
  a TODO inside `complianceBatchHandler.ts`. Does not affect the API
  surface.
* **Admin / Treasury / Support consoles** - the original Laravel
  surface lives under separate route files and was scoped out of
  the public API conversion (operator-only Filament panels). When
  those are migrated, they will reuse the same dashboard/align
  services already in place.

### Phase 9 (delivered)

Phase 9 ports the inbound webhook surface plus the outbound merchant
callback dispatcher.

* **Inbound webhook routes** (mounted at the API root to mirror the
  Laravel paths external providers have already registered):
  - `POST /caliza-webhook` -> 200, queues `ProcessCalizaWebhook` for
    forwarding to the operator-controlled downstream URL.
  - `POST /diginine-webhook` -> 200, queues `ProcessDiginineWebhook`.
  - `POST /ef-webhook` -> verified by the new
    `fvbankWebhookSignature` middleware (HMAC-SHA256 of the raw body
    against the FvBank `CLIENT_SECRET`), then 200 + Telegram log.
  - `POST /compliance/webhook-callback` -> matches on
    `compliance_data.transaction_id` (JSON path), promotes to
    `COMPLIANCE_APPROVED` and triggers `ProcessingUnit.make` on PASSED,
    `COMPLIANCE_REJECTED` on FAILED, writes an external_service_calls
    audit row regardless of outcome.
  - `POST /processingunit-webhook` -> dispatches by `module`:
    - `withdraw` -> updates BeneficiaryTransaction (with the same
      EVP/COMPLETED-protection rules as Laravel), enqueues
      `SendCallback` (PAYOUT_SUCCESS/PAYOUT_REJECTED) +
      `SendDebitNotification` on COMPLETED, runs `createRefund` on
      first-time FAILED transitions.
    - `deposit` -> updates DepositTransaction, writes status history,
      writes a credit ledger row keyed off the polymorphic morph.
* **FvBank signature middleware**
  (`middleware/fvbankWebhookSignature.ts`) - mirrors
  `VerifyFVBankSignature`. Uses the raw request body (captured by an
  `express.json verify` hook in `index.ts`) for byte-exact HMAC
  comparison so canonical JSON drift never breaks verification.
* **Merchant callback dispatcher**
  (`services/callbacks/merchantCallbackDispatcher.ts`) - resolves
  `users.merchant_id -> merchants.callback_url` and POSTs the
  Laravel-shaped envelope `{event, data, timestamp}`. The
  `SendCallback` worker writes a `callback_logs` row (polymorphic on
  the BeneficiaryTransaction) so deliveries are auditable end-to-end.
  Schema gained `merchants.callback_url` + `api_key` + `salt_key` +
  related fields to match the Laravel migration.
* **Forwarder workers** - `calizaWebhookHandler` and
  `diginineWebhookHandler` post raw webhook payloads to the operator's
  downstream service (URL fetched from `Secrets.external("caliza" /
  "diginine").CALLBACK_URL`) with retries via BullMQ exponential
  backoff. Telegram notification fires per attempt for ops visibility.
* **PU status mappers** (`services/processingUnit/statusMap.ts`) -
  ports `ProcessingUnit_status_map`, `ProcessingUnit_Depositstatus_map`,
  and `ProcessingUnitServiceMap`. New upstream statuses log a warning
  and default to PROCESSING so rows never silently freeze.
* **Compliance.make** now persists the provider response into
  `compliance_data` so the inbound webhook can match by
  `compliance_data.transaction_id` (mirrors Laravel
  `ComplianceService::storeComplianceResponse`).

### Phase 9 deferred items

* **`SendDebitNotification` -> Reports microservice** - the worker is
  registered and the eligibility gate (status == COMPLETED) is
  enforced, but the actual HTTP call to the Reports `api/debit_transactions`
  endpoint lands in Phase 10 alongside the rest of the Reports
  surface (it needs a separate `Secrets.external("report_server")`
  bundle and lives in a different SOC scope).
* **Outbound callback signing** - this Phase 9 dispatcher matches
  Laravel's unsigned format exactly so existing white-label consumers
  don't break. When merchants are ready, an `X-Signature` header keyed
  on `merchants.salt_key` can be added in
  `merchantCallbackDispatcher.ts` without touching call sites.
* **Caliza/Diginine native processing** - both providers' Laravel
  webhook handlers had the bulk of their business logic commented out
  (status updates happen via the operator's downstream service). The
  Node ports preserve that exact behavior.

### Phase 8c (delivered)

Phase 8c closes the remaining external-services items:

* **Excel import + PDF/Excel exports** - replaces every 501 in
  `deposits/export`, `ledgers/export`, `payout/export`,
  `payout/download-list`, `payout/template`, `payout/bulk/store`,
  `beneficiaries/bulk/template`, `beneficiaries/bulk/store`,
  `senders/bulk/template`, `senders/bulk/store` with real
  `exceljs`/`pdfkit` based generators.
  - `services/exports/excelImportService.ts` - dynamic-fields row
    validator with hidden machine-key row + lookup sheet for dropdowns.
  - `services/exports/pdfReceipt.ts` - single-receipt + bulk-table PDFs.
  - `services/exports/excelExport.ts` - generic table-to-XLSX exporter.
* **Mail transport** - `UserAuthEmailService.*` and
  `TeamAuthEmailService.*` now ship through `services/email/mailer.ts`
  (a single shared nodemailer transport, credentials from
  Secrets.mail()) using HTML templates in `services/email/templates.ts`.
* **multer file uploads** - `middleware/fileUpload.ts` accepts
  multipart/form-data with `memoryStorage`, 8 MiB / 6-file limits, then
  inlines each upload as a base64 data URL on `req.body` so existing
  handlers don't need to know about transport.
* **AED -> INR rate override** - `services/quotes/aedOverride.ts`
  replicates the Laravel `convertUSDratetoAED` helper. Wired into
  `quotesController.buildResponse` (cross-currency VirtualAccount
  path), `lookupsController.refreshRates`, and the `RefreshFxRates`
  cron handler. Configurable via `USD_TO_AED` env (defaults to 2.67).

Each phase keeps API contracts byte-stable and is deployable independently
behind a feature flag.

---

## Local development setup

The API has two distinct boot modes:

* **Dev mode** - flipped on by setting `DATABASE_URL` in `.env`. AWS
  Secrets Manager is bypassed entirely; every secret bundle reads from
  env vars instead. KMS-encrypted columns use a local AES-256-GCM key
  derived from `APP_KEY`. **AWS credentials are not required.**
* **Production mode** - `DATABASE_URL` is unset, all secrets load from
  AWS Secrets Manager via the `SECRET_ID_*` env vars, and KMS does
  real envelope encryption. The host must have an instance role with
  Secrets Manager + KMS permissions.

### 0. One-time machine prerequisites

* Node 22+ and npm 10+ (`node --version`, `npm --version`).
* MySQL 8.x running on `127.0.0.1:3306`.
* Redis 7.x running on `127.0.0.1:6379`.
* (Optional) the Laravel Prisma schema source-of-truth in `../Laravel/`
  if you plan to regenerate the schema with `prisma db pull`.

If you don't already have MySQL + Redis, the quickest path is Docker:

```bash
docker run -d --name eficyent-mysql \
  -e MYSQL_ROOT_PASSWORD=devroot \
  -e MYSQL_DATABASE=eficyent_node \
  -p 3306:3306 mysql:8

docker run -d --name eficyent-redis -p 6379:6379 redis:7
```

### 1. Install + seed config

```bash
git clone <this repo>
cd eficyent-api/node

cp .env.example .env
# Open .env and uncomment the entire "DEV MODE" block at the bottom.
# Fill in DATABASE_URL with your MySQL credentials and at minimum:
#   TOKEN_PEPPER, PASSWORD_PEPPER, APP_KEY
# Generate each with:
#   openssl rand -hex 32           # for TOKEN_PEPPER, PASSWORD_PEPPER, *_SECRET
#   openssl rand -base64 32        # for APP_KEY

npm install
```

### 2. Apply the schema

```bash
npx prisma generate
npx prisma migrate deploy   # runs all migrations against the DB
# OR for a from-scratch dev DB that you can iterate on:
npx prisma migrate dev --name init
```

If you only have the upstream Laravel migrations (no Prisma migrations
folder yet), introspect the live DB instead:

```bash
npx prisma db pull
npx prisma generate
```

### 3. Run the API + worker

```bash
npm run dev          # API on :8080 with tsx watch (hot reload)
npm run dev:worker   # BullMQ worker in a second terminal
```

Hit `http://localhost:8080/api/health` - you should get `{"status":true,"code":200,...}`.

### 4. Optional dev configurations

| What you want to test | Set in `.env` |
|---|---|
| Mail templates | `MAIL_HOST=localhost MAIL_PORT=1025` and run [MailHog](https://github.com/mailhog/MailHog) |
| S3 uploads | `S3_BUCKET=...` `S3_REGION=...` and `S3_USE_PATH_STYLE=true` for MinIO |
| External providers (Caliza, FvBank, etc.) | `EXTERNAL_<PROVIDER>_JSON='{"...":"..."}'` |
| Real AWS Secrets Manager (staging-like) | Comment out `DATABASE_URL`, set the `SECRET_ID_*` vars, run `aws sso login` (or set `AWS_PROFILE`) so the SDK can pick up creds |

### 5. Common dev errors

| Symptom | Fix |
|---|---|
| `CredentialsProviderError: Could not load credentials from any providers` | `DATABASE_URL` is not set in `.env`, so the API tried to load secrets from AWS. Add `DATABASE_URL=mysql://...` and uncomment the dev block. |
| `Authentication failed against database server` | Wrong creds in `DATABASE_URL`. Special characters in the password must be URL-encoded (`@` -> `%40`, `:` -> `%3A`). |
| `ECONNREFUSED 127.0.0.1:6379` | Redis not running. `docker start eficyent-redis`. |
| `Invalid environment configuration: KMS_KEY_ID: ...` | You're on an older clone. `git pull`; `KMS_KEY_ID` is now optional. |
| `Secret eficyent/dev/redis has no SecretString` | `DATABASE_URL` is set but you're hitting an env-secret path. `git pull` to get the dev fallbacks. |

---

## Production deployment

### A. Provision the AWS-side artefacts

1. **Secrets Manager bundles** (one secret per bundle, JSON value):
   ```
   eficyent/<env>/app    -> {"APP_KEY":"...", "REQUEST_SIGNING_SECRET":"...", "FVBANK_WEBHOOK_SECRET":"..."}
   eficyent/<env>/db     -> {"host":"...","port":3306,"database":"...","username":"...","password":"...","ssl":true}
   eficyent/<env>/redis  -> {"host":"...","port":6379,"password":"...","tls":true,"username":"default"}
   eficyent/<env>/auth   -> {"TOKEN_PEPPER":"...","PASSWORD_PEPPER":"...","SIGNATURE_SECRET":"...","MERCHANT_SIGNATURE_SECRET":"..."}
   eficyent/<env>/aws    -> {"S3_BUCKET":"...","S3_REGION":"us-east-1","S3_USE_PATH_STYLE":false}
   eficyent/<env>/mail   -> {"host":"...","port":587,"username":"...","password":"...","from":"no-reply@..."}
   eficyent/<env>/external/<provider>  -> per-provider object (URL, API_KEY, ...)
   ```
   Generate the random values with `openssl rand -hex 32` /
   `openssl rand -base64 32`. Pepper rotation requires a re-hash of
   stored passwords - do it during a planned maintenance window.

2. **KMS CMK** with `kms:Encrypt`, `kms:Decrypt`, `kms:GenerateDataKey`
   permissions on the application's IAM role. Set `KMS_KEY_ID` to the
   key ARN or alias (e.g. `alias/eficyent/production/app`).

3. **IAM role** for the API/worker host with:
   ```
   secretsmanager:GetSecretValue   on the eficyent/<env>/* secrets
   kms:Decrypt + Encrypt + GenerateDataKey   on the CMK above
   s3:GetObject + PutObject        on the S3_BUCKET
   ```

4. **MySQL** (Aurora MySQL 8 / RDS / managed) with `ssl: true`.

5. **Redis** (ElastiCache or Upstash) with TLS + auth.

### B. Deploy steps

```bash
# Build (TypeScript -> dist/, regenerates Prisma client)
npm ci --omit=dev
npm run build

# Apply migrations (run once per release, idempotent)
npx prisma migrate deploy

# Start the API + workers (one process each, or use process manager)
node dist/index.js          # HTTP API
node dist/worker.js         # BullMQ worker (run >= 2 replicas)
```

### C. Production-only env

Set ONLY these in your hosting environment (everything else lives in
Secrets Manager):

```
NODE_ENV=production
APP_ENV=production
APP_URL=https://api.eficyent.example.com
PORT=8080
TRUST_PROXY=1

AWS_REGION=us-east-1
KMS_KEY_ID=arn:aws:kms:us-east-1:<acct>:key/<uuid>

SECRET_ID_APP=eficyent/production/app
SECRET_ID_DB=eficyent/production/db
SECRET_ID_REDIS=eficyent/production/redis
SECRET_ID_AUTH=eficyent/production/auth
SECRET_ID_AWS=eficyent/production/aws
SECRET_ID_MAIL=eficyent/production/mail
SECRET_ID_EXTERNAL_PREFIX=eficyent/production/external

CORS_ORIGINS=https://app.example.com,https://admin.example.com
LOG_LEVEL=info
```

Do **NOT** set `DATABASE_URL` in production - that flag puts the
process into dev mode and bypasses Secrets Manager + KMS.

### D. Health checks + smoke test

```bash
curl https://api.eficyent.example.com/api/health
# -> {"status":true,"code":200,"message":"ok","data":null}
```

### E. Operational runbook

* **Rotating a secret**: update the JSON in Secrets Manager, then
  either roll the pods or `POST` to an internal `/admin/secrets/invalidate`
  endpoint (not yet exposed publicly - call `Secrets.invalidate()` from
  a scripted runbook for now). Cache TTL is `SECRETS_CACHE_TTL_MS`
  (default 5 min).
* **Replaying webhooks**: BullMQ retains failed jobs for 30 days. Use
  Bull dashboard or `bullmq-cli` to retry a stuck `payout` /
  `processingunit-webhook` job.
* **Rolling deploys**: workers are idempotent (BullMQ jobIds dedupe).
  API pods can be rolled freely; sessions are Redis-backed.
