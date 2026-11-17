# Cloudflare deployment

## Projects and release targets

- **Current production API Worker:** `naughtyfamily-api` at https://naughtyfamily-api.kboone801.workers.dev
- **Current production D1:** `naughty-company-dashboard` (UUID `bbbe128a-c5cc-46ec-b8ef-93860183e795`)
- **Legacy Pages rollback site:** `naughty-company-dashboard` at https://naughty-company-dashboard.pages.dev
- **New Pages cutover target:** `naughtyfamily` at https://naughtyfamily.pages.dev
- **Acceptance Pages:** `naughtyfamily-staging` at https://naughtyfamily-staging.pages.dev
- **Acceptance API Worker:** `naughtyfamily-api-staging` at https://naughtyfamily-api-staging.kboone801.workers.dev
- **Acceptance D1:** `naughtyfamily-acceptance-staging` (UUID `02cca699-1232-495f-8a0a-de525058b92a`)
- **Git repository:** `SharpSplinter/Naughty-Company-Dashboard`
- **Production branch:** `main`

The legacy Pages project `naughty-company-dashboard` was rebuilt from `main` and published on 2026-11-17 as deployment `02c82647-7bd2-47f7-8ffd-ec3c2e7ee3c2`. Its compiled frontend and saved production Pages build variable now use `https://naughtyfamily-api.kboone801.workers.dev`, replacing the retired `naughty-company-api` hostname. This repairs the static frontend-to-API URL wiring. No login or authenticated API smoke was run, so treat this as a repaired Company Dashboard fallback candidate, not a fully end-to-end-verified portal rollback. The separate `naughtyfamily` project is configured for `main` with automatic production/preview deployments disabled and still has no production deployment. Do not point a staging Worker or acceptance database at production resources.

Pages build settings for the new target:

- Build command: `npm run build`
- Output directory: `dist`
- Root directory: repository root
- Production build variable: `VITE_API_BASE_URL=https://naughtyfamily-api.kboone801.workers.dev`

See [PRODUCTION-CUTOVER-REVIEW.md](PRODUCTION-CUTOVER-REVIEW.md) for the release checklist, verified production baseline, backup procedure, migration order, rollback boundaries and explicit no-production-change status.

## API Worker

The Worker exposes health, authenticated dashboard, company intelligence, automation, and administrator routes. The current health check is `GET /health`. Company IDs must be positive integers. Torn API keys are validated through the Worker; never put a key in a URL, source file, or logs.

The Worker maps Torn API errors into stable HTTP statuses and accepts browser requests from `https://naughtyfamily.pages.dev`, the preserved legacy Pages hostname for compatibility, and localhost port 3000 for local development. The production master Full Access key is configured as secret `TORN_API_KEY_SERVICE`; the Worker code must use that exact binding name. `TORN_API_KEY_CUSTOM` remains a fallback for public global-ranking requests, and `TORN_FACTION_API_KEY` remains dedicated to scheduled public faction collection.

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

## Local development

- Node.js 20+
- `npm ci`
- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm test`

Production Pages publishing is manual during this migration. Do not publish the portal to the legacy `naughty-company-dashboard` project. After the production Worker migration/deployment and health verification are approved, build with the production API URL and explicitly publish `dist/` to the `naughtyfamily` project. Keep both projects' automatic deployments disabled until the cutover is accepted.

The production Worker workflow is `workflow_dispatch`-only on `main` and targets only `naughtyfamily-api`. It uses the GitHub Environment `production`; configure required reviewers and restrict its deployment branches to `main` before release. The workflow's evidence preflight runs before the first Cloudflare action and requires:
- an HTTPS external-backup reference, independently verified SHA-256, and backup timestamp less than 24 hours old;
- a fresh Time Travel bookmark and D1 migration-ledger reference;
- account-wide D1 rows-read evidence less than 15 minutes old, with an explicit hard stop and deployment reserve that do not exceed the hard stop;
- successful, manually dispatched isolated restore-rehearsal and stateful-staging runs for the exact candidate commit, with the candidate Git tree matching the `main` release tree;
- service-key permission evidence and a reviewed Queue configuration reference;
- explicit release authorization and explicit authorization to reconcile the Queue bindings declared in `wrangler.toml`.

The preflight validates reference formats, age, numeric headroom, exact GitHub workflow paths/run outcomes, and tested commit/tree identity. The separate manual [offline restore rehearsal workflow](https://github.com/SharpSplinter/Naughty-Company-Dashboard/blob/portal-rebuild/.github/workflows/restore-production-backup-rehearsal.yml) now downloads and checks the encrypted archive, decrypts it only on an ephemeral runner, and replays migrations 0013–0037 against a local SQLite restore. It does not call Cloudflare or D1. This local replay does not replace the separate stateful D1 staging acceptance. The production Environment reviewer approval is separate. The `production-backup` Environment must have the `PRODUCTION_D1_BACKUP_URL` and `PRODUCTION_D1_BACKUP_PASSWORD` secrets configured before the restore workflow can run. The preflight does **not** independently verify external D1/Time Travel/service-key/Queue reference contents or inspect Cloudflare quotas. Those must be independently inspected before dispatch; see [PRODUCTION-CUTOVER-REVIEW.md](PRODUCTION-CUTOVER-REVIEW.md) for the remaining NO-GO release gates.
