# Cloudflare deployment

## Projects and release targets

- **Production Pages:** `naughtyfamily` at https://naughtyfamily.pages.dev
- **Production API Worker:** `naughtyfamily-api` at https://naughtyfamily-api.kboone801.workers.dev
- **Production API D1:** `naughty-company-dashboard`
- **Production Discord bot Worker:** `naughty-company-bot` at https://naughty-company-bot.kboone801.workers.dev
- **Production bot D1:** `naughty-company-bot-production`
- **Production rankings Queue and DLQ:** `ncd-global-rankings-refresh` and `ncd-global-rankings-refresh-dlq`
- **Production daily-read cache:** Workers KV binding `NCD_DAILY_READ_CACHE`
- **Git repository:** `SharpSplinter/Naughty-Company-Dashboard`
- **Production branch:** `main`

The account's dashboard infrastructure is production-only. Staging/acceptance Workers, Pages projects, D1 databases, Queues, test Workers and their staging cache namespaces have been retired. The legacy and empty Pages projects have also been removed. Keep the unrelated `tornapi-plugin-gpt` Worker and its OAuth KV namespace separate from the dashboard stack.

The sole Pages target is manually published to `naughtyfamily` after the production API is healthy. Automatic production and preview deployments remain disabled.

## API Worker

The Worker exposes health, authenticated dashboard, company intelligence, automation, and administrator routes. The current health check is `GET /health`. Company IDs must be positive integers. Torn API keys are validated through the Worker; never put a key in a URL, source file, or logs.

The Worker maps Torn API errors into stable HTTP statuses and accepts browser requests from `https://naughtyfamily.pages.dev` and localhost port 3000 for local development. The production master Full Access key is configured as secret `TORN_API_KEY_SERVICE`; the Worker code must use that exact binding name. `TORN_API_KEY_CUSTOM` remains a fallback for public global-ranking requests, and `TORN_FACTION_API_KEY` remains dedicated to scheduled public faction collection.

## Security notes

Members authenticate with their own limited-access Torn API key. The Worker validates Naughty Souls faction membership, encrypts saved Torn credentials at rest, and issues random bearer session tokens while storing only SHA-256 hashes in D1. The browser stores the session token locally; raw Torn keys are not stored in browser storage. Dashboard sessions expire after 30 days.

### Portal administrator authorization

The portal branch uses Torn-identity-backed administrator roles rather than a separate administrator password:

1. A member signs in with their own Torn API key. The Worker validates the key, confirms the player's identity and Naughty Souls faction membership, and creates a session tied to that verified Torn player ID.
2. Administrator privilege is a separate active role in the D1 `administrators` registry. Every `/api/admin/*` request checks the authenticated session's player ID against that registry.
3. The owner bootstrap is restricted to the configured `ADMIN_PLAYER_ID` and uses insert-if-absent semantics. It does not silently re-enable an administrator whose registry row was revoked.
4. A Torn player ID alone is not an authentication credential. The member's Torn API key proves account control; the verified player ID is the identity to which the administrator role is attached.

The portal code does not require `ADMIN_USERNAME` or `ADMIN_PASSWORD_HASH`. Do not follow legacy instructions to create or rotate those secrets as a portal cutover step. Changing Worker secrets can immediately publish a new version of the currently targeted Worker.

**Production boundary:** until the portal Worker, its approved D1 migrations and the new `naughtyfamily` Pages frontend are released together, the live Company Dashboard remains on its legacy administrator flow. Staging acceptance of the registry flow does not switch production authorization. Do not attempt an interim production administrator-data or secret change without a separate approved release plan.

## Worker-side D1 rows-read accounting

Each Worker event now emits one structured `d1_read_accounting` record after its D1 work completes:

- HTTP requests: one summary per request, using a normalized route and the Cloudflare request ID when available.
- Queue consumers: one summary per queue batch, including the message count.
- Scheduled events: one summary per cron invocation. The meter waits for tracked `ctx.waitUntil()` work, including admin refresh jobs, before it emits the total.

The count comes from D1 statement metadata, not account analytics deltas. The wrapper records `meta.rows_read` and `meta.rows_written` for `all()`, `run()`, and every statement result returned by `batch()`. D1's `first()` method returns a row without metadata, so the wrapper executes the equivalent query inside an outer `SELECT * FROM (...) LIMIT 1` through `all()`, preserving first-row behavior while retaining the metadata result. The existing Worker `.first()` call sites are SELECT/CTE queries.

The log record includes aggregate rows read/written, statement/method counts, missing metrics, failed statements, unsupported operations, background-task counts, and an `accountingStatus`. It deliberately excludes SQL text, bound values, player IDs and API keys. A record is `incomplete` if a D1 result omits `rows_read`, a statement fails, a batch returns a mismatched result count, a metadata-free `first()` fallback is required, or a code path uses `raw()`/database `exec()` where this wrapper cannot obtain per-statement metadata. The `unmeteredFirstFallbacks` field makes those compatibility fallbacks visible. Treat any `incomplete` record as a stop condition for quota certification; never count it as zero. Logs are emitted as structured objects so Workers Logs can index their fields, not as JSON embedded in a message string.

`wrangler.toml` enables Workers Observability with `head_sampling_rate = 1.0` so production accounting events are not intentionally sampled. The records are emitted to Cloudflare Workers Logs, not written back to D1, avoiding recursive reads/writes in the application database. To calculate a run total, sum `rowsRead` only across complete `d1_read_accounting` records for the corresponding time window and include fetch, queue and scheduled events. Account-level D1 analytics remains useful as a cross-check, but must not replace these statement-level totals when it under-reports.

**Retention boundary:** Workers Logs are short-term operational telemetry, not a permanent ledger. On Cloudflare's Free Workers Logs allowance, stored logs have a three-day retention period; other plans have different retention allowances. Export the structured records to an approved durable destination (for example, Workers Logpush or an OpenTelemetry destination) before relying on historical totals beyond the available retention window. No external log destination is configured by this code change.

The meter is runtime code only. It has not been deployed to either Worker by this change, and no D1, Queue, or production resource was accessed to validate it.

## Local development

- Node.js 20+
- `npm ci`
- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm test`

Production Pages publishing remains manual. Build with the production API URL and explicitly publish `dist/` to the sole dashboard Pages project, `naughtyfamily`. Automatic deployments remain disabled.

The production Worker workflow is `workflow_dispatch`-only on `main` and targets only `naughtyfamily-api`. It uses the GitHub Environment `production`; configure required reviewers and restrict its deployment branches to `main` before release. The workflow's evidence preflight runs before the first Cloudflare action and requires:
- an HTTPS external-backup reference, independently verified SHA-256, and backup timestamp less than 24 hours old;
- a fresh Time Travel bookmark and D1 migration-ledger reference;
- account-wide D1 rows-read evidence less than 15 minutes old, with an explicit hard stop and deployment reserve that do not exceed the hard stop;
- a successful, manually dispatched offline production-data restore rehearsal for the exact rehearsal commit, with the candidate Git tree matching the `main` release tree and all migration/replay files unchanged;
- service-key permission evidence and a reviewed Queue configuration reference;
- explicit release authorization and explicit authorization to reconcile the Queue bindings declared in `wrangler.toml`.

The preflight validates reference formats, age, numeric headroom, exact GitHub workflow paths/run outcomes, and tested commit/tree identity. The separate manual [offline restore rehearsal workflow](https://github.com/SharpSplinter/Naughty-Company-Dashboard/blob/portal-rebuild/.github/workflows/restore-production-backup-rehearsal.yml) now downloads and checks the encrypted archive, decrypts it only on an ephemeral runner, and replays migrations 0013–0037 against a local SQLite restore. It does not call Cloudflare or D1. This local replay is the required restore rehearsal; there is no longer a staging D1/Queue environment. The production Environment reviewer approval is separate. The `production-backup` Environment must have the `PRODUCTION_D1_BACKUP_URL` and `PRODUCTION_D1_BACKUP_PASSWORD` secrets configured before the restore workflow can run. The preflight does **not** independently verify external D1/Time Travel/service-key/Queue reference contents or inspect Cloudflare quotas. Those must be independently inspected before dispatch; see [PRODUCTION-CUTOVER-REVIEW.md](PRODUCTION-CUTOVER-REVIEW.md) for the remaining NO-GO release gates.


### Current production D1 backup (2026-11-17)

The latest manual production D1 export is now available as an encrypted GPG AES-256 archive. The backup is tied to Time Travel bookmark `000004d7-00000aa9-00005126-131d7ed09c8a32272620b830a726a489`; encrypted archive SHA-256 is `2df6bb90368ab669668a47d262e477928741afaa95dcdc5ea1988ec31a6b96d5`, and the untouched SQL export SHA-256 is `8034189ebcad7a2e21210b030187d2514eeb451f2bf42387d021977392b7497f`.

The export was replayed locally against SQLite with migrations `0013–0037`: 25 migrations passed, the ledger moved from 16 to 41 entries, all 39 pre-existing application tables and their row counts were preserved, `integrity_check` returned `ok`, and `foreign_key_check` returned zero violations. This was a local SQLite rehearsal, not a D1 import or stateful staging acceptance.

To run the repository's GitHub restore workflow against the archive, set these secrets in the protected GitHub Environment named `production-backup`:
- `PRODUCTION_D1_BACKUP_URL`: the encrypted archive download URL delivered to the owner.
- `PRODUCTION_D1_BACKUP_PASSWORD`: the separate GPG passphrase delivered to the owner.

Do not put the passphrase in workflow inputs, logs, repository files, or artifacts. The workflow verifies the encrypted archive checksum, decrypts only on the ephemeral runner, verifies the raw SQL export checksum, replays migrations locally, and retains only the sanitized report. The encrypted download link delivered in chat is a file-transfer link, not the long-term backup location; retain a copy in restricted storage under the owner's control.
