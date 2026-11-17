# Production backup, migration, rollback and cutover review

**Original review date:** 2026-11-03  
**State refresh:** 2026-11-17 UTC (production legacy Pages API wiring repair, portal Pages-only staging publication, current PR/base relationship and release blockers refreshed)
**Scope:** PR #152, branch `portal-rebuild`  
**Decision:** **NO-GO for production cutover at this review.** The production Time Travel current bookmark and live D1/Worker/Pages baseline have been rechecked, and the release workflow/configuration safeguards are present. PR #152 remains OPEN/DRAFT with no submitted GitHub review approvals. The latest Halloween/Revitalize changes have not had a functional staging acceptance run on the current release candidate, production service-key fallback acceptance remains to be confirmed, and explicit approval to merge/deploy has not been given. This review performs no production mutation.

**2026-11-13 baseline update:** PR #155 merged at `f0420232231fa9708cece921a4fd5921eaad8e71`. Its production Worker deployment succeeded, migration `0012_company_ranking_snapshots.sql` was applied, and the existing `naughty-company-dashboard` Pages site was manually deployed from Android. The owner confirmed Trends & Charts displays the correct data. This does **not** deploy the Naughty Family portal branch or authorize its remaining migrations.

## 1. Acceptance status

### Company API keys — accepted on staging

The operator confirmed successful company-data refresh on the isolated staging portal with:

- A primary Torn Full Access key.
- A primary Torn Custom Access key.
- Secondary company API keys.

Secondary company keys were also added and removed successfully. A secondary key is validated by the company profile returned by Torn, and the returned company ID scopes the credential under the authenticated portal account. It is not required to belong to the portal member's Torn player ID. It does not replace the primary sign-in key or grant director permissions.

This acceptance is specifically for company profile/employee/stock refresh. It does **not** establish permission acceptance for owner-only bars/cooldowns, detailed networth, or Halloween historical logs; those features have separate selections and consent requirements.

The stateful acceptance environment is:

- Pages: `https://naughtyfamily-staging.pages.dev`
- Worker: `https://naughtyfamily-api-staging.kboone801.workers.dev`
- D1: `naughtyfamily-acceptance-staging`

The portal staging D1 migration ledger was read after the final PR #152 staging integration: 30 migration records through `0025_halloween_attack_metrics.sql`, with 64 tables. Full quality gates passed on [run #43508964744](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/43508964744), and the complete isolated D1/Queue integration passed on [run #43508964870](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/43508964870). That integration verified private-live consent/owner checks, faction stats missing/unexpected-field metadata, roster/personalstats/gym-energy collection, immutable weekly report creation and comparison, authenticated APIs, admin recovery safeguards, transient-error retries and DLQ behavior. These runs contacted only portal staging D1 and sanitized fixture Workers; no production D1 or Worker was contacted.

## 2. Production administrator-access blocker (owner-reported, 2026-11-14)

The project owner reports being unable to reach the production administrator controls because production still uses the legacy separate administrator username/password step-up. This is consistent with the current `main` implementation: the Worker expects the `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` configuration and the production UI presents a separate administrator credential form after the member session is established. This is distinct from the PR #152 portal implementation, which has not been deployed.

The intended PR #152 authorization flow is:

1. The member signs in with a Torn API key belonging to their own account. The Worker validates that key with Torn, confirms the player's identity and Naughty Souls faction membership, and creates a session tied to that verified Torn player ID.
2. Administrator privilege is a separate role attached to that verified player ID in the D1 `administrators` registry. The Worker joins the active role to the authenticated session and checks it on every `/api/admin/*` request.
3. The portal administrator registry UI grants/revokes by Torn player ID. The owner bootstrap is limited to the configured `ADMIN_PLAYER_ID` and uses insert-if-absent semantics; it does not override a previously revoked row.
4. A Torn ID by itself is not an authentication secret. The Torn API key proves account control; the verified player ID is the stable identity to which the administrator role is attached.

**Operational consequence:** The new Torn-identity/administrator-registry flow cannot provide production admin access until the portal D1 migrations (including `0012_administrator_registry.sql`), the portal Worker, and the `naughtyfamily` Pages frontend are deployed together. Until then, production continues to use the legacy administrator credential step-up, which the owner reports is currently unusable. Staging acceptance of the new role flow is not proof that production has switched over.

Do not attempt to work around production authorization, alter production administrator records, or change production secrets as an interim fix. A full production D1 export backup and isolated data restore rehearsal have completed successfully; the exact backup/checksum and rehearsal results are recorded in Section 6. The current Time Travel bookmark was re-read at 2026-11-14 04:23:12.859 UTC and recorded below. Re-read the current bookmark again immediately before migration if any writes, maintenance-driven bookmark advance, or meaningful delay occurs. The cutover remains paused pending final feature-level staging acceptance, confirmation of the production service-key fallback, explicit release approval, and the operator-ready migration/deployment window. Production remains unchanged.

## 3. Verified production baseline

These values were read from Cloudflare and the live production D1 database during this review. Re-check them immediately before a release; do not assume they remain unchanged.

| Resource | Verified state |
|---|---|
| Production API Worker | `naughtyfamily-api` |
| Production D1 | `naughty-company-dashboard` |
| Production D1 UUID | `bbbe128a-c5cc-46ec-b8ef-93860183e795` |
| Production D1 schema | 41 tables; existing member/session/company/history data is present |
| Production migration ledger | 16 entries; latest is `0012_company_ranking_snapshots.sql` |
| Portal-branch migrations requiring pre-cutover ledger reconciliation | `0012_administrator_registry.sql` and `0013` through `0037` |
| Active Worker version | `af3b0630-c758-4910-9a41-d43c8c330960` (100% traffic; deployed 2026-11-13 20:00:55 UTC) |
| Legacy Pages site | `https://naughty-company-dashboard.pages.dev` |
| Legacy Pages canonical production deployment | `b0352cf1-db23-437e-87b4-a363d08b53b8` (2026-11-13; PR #155 frontend) |
| New Pages target | `https://naughtyfamily.pages.dev`; no production deployment yet |
| New Pages API base | `https://naughtyfamily-api.kboone801.workers.dev` |

At the last recorded read-only production D1 check (2026-11-14), the ledger contained 16 migration records and ended with `0012_company_ranking_snapshots.sql`; the schema had 41 tables. The portal branch additions after that recorded baseline are `0012_administrator_registry.sql` and `0013` through `0037`. The two `0012` filenames are distinct. This production ledger is not freshly re-read as part of the 2026-11-16 staging work; reconcile the exact live filenames immediately before any approved migration. Production is not a clean or empty database. Do not repoint acceptance resources at production.

Cloudflare D1 Time Travel bookmarks are generated automatically; there is no manual bookmark-creation action. A fresh read-only `GET` of the current bookmark was completed at **2026-11-14T04:23:12.859Z** for production D1 `naughty-company-dashboard`. It returned `000004ca-0000033a-00005123-06be4f012000b1afd17db773eeaf4ef8`, unchanged from the export-time bookmark recorded in Section 6. This is a freshly revalidated current-bookmark reference, **not a newly minted snapshot**. Cloudflare documents that bookmarks advance automatically and can also move due to internal maintenance without application SQL writes. Re-read the current bookmark immediately before the actual migration if the cutover is delayed or any writes/maintenance events occur.

## 4. Deployment safety controls

### Pages

The legacy `naughty-company-dashboard` Pages project's Git automatic deployments are currently disabled. The latest production deployment is `b0352cf1-db23-437e-87b4-a363d08b53b8`, published on 2026-11-13 after PR #155. Preserve this site as the current live Company Dashboard and fallback; do not publish the separate portal branch to this project.

The new `naughtyfamily` Pages target is configured for `main`, with automatic production and preview deployments disabled. It has no production deployment yet. The production `VITE_API_BASE_URL` is set to the current production API Worker.

The legacy Pages production publish for PR #155 has already completed. The separate `naughtyfamily` target still has no production deployment. For the eventual portal cutover, deploy deliberately to `naughtyfamily` only after its Worker/schema is ready. Do not re-enable legacy Git deployment during the release.

### Worker

The previous `.github/workflows/worker-deploy.yml` ran on pushes to `main`, applied pending production D1 migrations, then deployed the production Worker. That made a merge capable of changing production implicitly.

The PR branch now makes this workflow `workflow_dispatch` only. It requires:
- The workflow to be run from `main`.
- The explicit target `naughtyfamily-api`.
- An operator-supplied reference to a verified production backup stored outside this repository.

The workflow lists pending migrations, applies them, lists the ledger again, deploys the Worker, and checks production health plus encryption readiness. The backup-reference input is a manual gate only: the workflow does not create, download, inspect, or validate the backup. The operator must complete those checks independently before dispatching it. This safeguard takes effect when the PR's workflow change is merged to `main`.

## 5. Migration review

The current `portal-rebuild` branch contains **42 SQL migration files**, with the latest migration `0037_private_data_visibility.sql`. This is the complete ordered filename inventory, not just the newer tail of the chain:

```text
0001_auth.sql
0002_company_financial_history.sql
0002_faction_directors.sql
0003_company_data_sharing.sql
0003_faction_star_weekly_counts.sql
0004_company_data_sharing.sql
0005_admin_panel.sql
0006_automation.sql
0007_automation_delivery_and_rules.sql
0008_admin_endpoint_refresh.sql
0008_combined_webhook_delivery.sql
0009_discord_alert_poll_monitoring.sql
0009_faction_director_snapshot_kind.sql
0010_admin_step_up.sql
0011_discord_account_linking.sql
0012_administrator_registry.sql
0012_company_ranking_snapshots.sql
0013_faction_membership_verification.sql
0014_halloween_historical_keys.sql
0015_halloween_shared_archive.sql
0016_membership_revalidation_scheduler.sql
0017_halloween_member_event_slots.sql
0018_membership_verification_state.sql
0019_faction_performance_collection.sql
0020_faction_weekly_boundaries.sql
0021_faction_weekly_reports.sql
0022_faction_stats_snapshots.sql
0023_member_private_live_connections.sql
0024_halloween_custom_key_support.sql
0025_halloween_attack_metrics.sql
0026_halloween_attack_outcome_metrics.sql
0027_halloween_exchange_market_price_cache.sql
0028_christmas_town_archive.sql
0029_halloween_historical_event_years.sql
0030_event_history_consent_records.sql
0031_torn_event_calendar_windows.sql
0032_portal_first_login_consent.sql
0033_gym_training_history.sql
0034_portal_api_key_usage_consent.sql
0035_portal_api_key_access_type.sql
0036_admin_read_path_indexes.sql
0037_private_data_visibility.sql
```

There are multiple files with the same numeric prefix (`0002`, `0003`, `0008`, `0009`, and `0012`). Migration checks and release records must compare the complete filenames, not numeric prefixes alone. In particular, `0012_administrator_registry.sql` and `0012_company_ranking_snapshots.sql` are distinct migrations.

At the last recorded read-only production ledger check (2026-11-14), production D1 had 16 migration records and ended at `0012_company_ranking_snapshots.sql`. The portal branch additions after that recorded baseline are `0012_administrator_registry.sql` and `0013` through `0037`. This is a historical baseline, not a claim that the live ledger has been re-read on 2026-11-16. Re-read the exact production ledger immediately before any approved migration.

| Migration file(s) | Purpose |
|---|---|
| `0012_administrator_registry.sql` | Durable administrator role registry |
| `0013_faction_membership_verification.sql` | Torn faction membership verification |
| `0014_halloween_historical_keys.sql` | Member-owned Halloween historical collection key metadata |
| `0015_halloween_shared_archive.sql` | Shared Halloween archive structures |
| `0016_membership_revalidation_scheduler.sql` | Scheduled member revalidation state |
| `0017_halloween_member_event_slots.sql` | Per-member Halloween event windows |
| `0018_membership_verification_state.sql` | Membership verification and fail-closed state |
| `0019_faction_performance_collection.sql` | Public faction roster/stat/gym collection runs and snapshots |
| `0020_faction_weekly_boundaries.sql` | Idempotent Sunday-boundary run registry |
| `0021_faction_weekly_reports.sql` | Immutable completed-week reports and member results |
| `0022_faction_stats_snapshots.sql` | Faction-wide stats collection and snapshots |
| `0023_member_private_live_connections.sql` | Private-live consent metadata, snapshots, and request throttling |
| `0024_halloween_custom_key_support.sql` | Rebuilds Halloween historical-key storage to support Full and Custom Access while copying existing rows |
| `0025_halloween_attack_metrics.sql` | Halloween attack and Revitalize metrics |
| `0026_halloween_attack_outcome_metrics.sql` | Successful/lost/stalemated attack outcome totals and version metadata |
| `0027_halloween_exchange_market_price_cache.sql` | Shared public item-market average-price cache |
| `0028_christmas_town_archive.sql` | Encrypted Christmas Town history connections, collection jobs, and event logs |
| `0029_halloween_historical_event_years.sql` | Known historical Halloween event windows for 2021–2025 |
| `0030_event_history_consent_records.sql` | Per-player event-history consent records and legacy backfill |
| `0031_torn_event_calendar_windows.sql` | Torn calendar source/confirmation metadata and per-player event-calendar cache |
| `0032_portal_first_login_consent.sql` | Centralized first-login/policy consent and collection/sharing preferences |
| `0033_gym_training_history.sql` | Member-owned Gym Training key metadata, collection jobs, logs, and indexes |
| `0034_portal_api_key_usage_consent.sql` | API-key usage consent, acknowledgement timestamp, and key fingerprint |
| `0035_portal_api_key_access_type.sql` | Constrained `custom` / `full` API-key access declaration |
| `0036_admin_read_path_indexes.sql` | Company/player administrative and faction-boundary read indexes |
| `0037_private_data_visibility.sql` | Private-data visibility preferences and fingerprint-bound member-key capability cache |

The current-candidate staging acceptance runs [#316](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/43792813370) and [#317](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/43793005243) passed their isolated-staging migration-apply and migration-ledger verification steps. Those runs targeted `naughtyfamily-acceptance-staging` only. They do not establish that production has applied any of the portal migrations.

The migration review found no intentional deletion of company history. In particular, migration `0024_halloween_custom_key_support.sql` rebuilds the Halloween historical-key table by copying its existing rows before replacing the table. The ordered chain, final table definition, row counts, and foreign-key integrity still require verification against a restored production-data copy before release.

**Important distinction:** the 2026-11-14 production-data restore rehearsal replayed the backup through its existing migration ledger ending at `0012_company_ranking_snapshots.sql`; it did not replay migrations `0013`–`0037`. The isolated acceptance D1 migration run is not a substitute for replaying this full chain against restored production data. See Section 6 and Section 15.

## 6. Production backup procedure

D1 Time Travel provides point-in-time recovery within the preceding 30 days. A separate SQL export provides a portable backup. Cloudflare notes that a D1 export can block queries while it runs, so schedule it during a quiet release window.

### Completed production export and isolated restore rehearsal (2026-11-14)

A full D1-compatible SQL export was completed from production database `naughty-company-dashboard` (`bbbe128a-c5cc-46ec-b8ef-93860183e795`). The export captured Time Travel bookmark `000004ca-0000033a-00005123-06be4f012000b1afd17db773eeaf4ef8` at 2026-11-14 03:38:56 UTC. The untouched SQL export is 7,706,099 bytes with SHA-256 `8ac318ed69c22eea82d8bc5cff55fe010236a3dc9c979ed718fae3ee0282eb7e`.

**Current bookmark recheck (2026-11-14 04:23:12.859 UTC):** a read-only `GET /time_travel/bookmark` with no timestamp parameter returned the same bookmark token as the export-time record above. This validates that token as the current bookmark at the time of this review; it does not create a new manual snapshot. Cloudflare states Time Travel is always enabled, bookmarks are automatically generated, and bookmark values may advance due to internal maintenance events. See [Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

The first direct import attempt exposed a 4.3 MB `global_rankings_cache` statement exceeding D1's per-statement limit. The export also interleaves data for a child table before a later referenced table definition. A lossless import-normalized derivative was prepared: it breaks the 4,295,173-character JSON value into bounded hex-literal append operations, creates all 40 application tables before row data, inserts parent tables before dependants using the exported foreign-key graph, restores `sqlite_sequence` state after data, and creates all 22 explicit indexes last. The JSON value and its `fetched_at` timestamp were reconstructed and compared exactly.

The normalized SQL is 12,029,770 bytes, SHA-256 `1188579647f91ad310ec9069eaedd2e896c591a2f7e3ac5365474fb790a34ab2`. It passed a complete local SQLite transaction replay in 0.48 seconds: `PRAGMA integrity_check` returned `ok`, `PRAGMA foreign_key_check` returned zero violations, 40 application tables and 934 rows were present, and the 16-entry migration ledger ended with `0012_company_ranking_snapshots.sql`.

The same normalized SQL then imported successfully into temporary isolated D1 database `naughty-company-dashboard-restore-rehearsal-v3-20261113` in ENAM: 1,270 statements completed, with 40 application tables, 22 explicit indexes, 934 application rows, and 16 migration entries. All 40 per-table row counts matched the local replay. The 4,295,173-character global rankings JSON was valid and contained 15,344 array entries. Cloudflare D1's table-valued `pragma_foreign_key_check` returned zero violations. Cloudflare's D1 REST query API rejected a direct `PRAGMA integrity_check` request with `SQLITE_AUTH`; therefore the local integrity result is explicitly not represented as a direct D1 integrity-check result.

All three temporary restore-rehearsal D1 databases (two failed attempts and the successful verified copy) were deleted after the checks. No rehearsal database remains. No production D1 writes, migrations, restores, Worker deployments, Pages deployments, or secret changes were performed.

The refreshed encrypted archive is stored outside the repository and includes both the untouched original export and the normalized restore SQL, sanitized production metadata, checksums and this rehearsal report. Archive SHA-256: `052e5bcf352d17ae988eae15ff051e76c5380259c19dc0c694de5611c2c7fb4b`. The download reference and separately issued archive password are retained in the owner conversation; neither is committed here.

From a trusted, authenticated operator environment:

```sh
npx wrangler whoami
npx wrangler d1 migrations list naughty-company-dashboard --remote --config wrangler.toml
npx wrangler d1 export naughty-company-dashboard --remote --output "$BACKUP_PATH"
sha256sum "$BACKUP_PATH"
```

Requirements:
- `BACKUP_PATH` must resolve to encrypted, access-controlled storage outside the repository.
- Confirm that the export completed, is non-empty, and has a recorded SHA-256 checksum.
- Keep the export and its checksum in a restricted location accessible to the recovery operator. Do not upload the SQL export to a general CI artifact, commit it, or paste it into chat.
- Record the backup storage reference in the manual Worker workflow's `backup_reference` input.
- Capture a fresh Time Travel bookmark through Cloudflare's D1 Time Travel API immediately before migrations. Keep the bookmark alongside the backup reference.
- Do not use the review-time bookmark as the pre-release bookmark if any writes have occurred since it was captured.

Cloudflare Wrangler documents that `d1 migrations apply` captures a backup and that a failed migration is rolled back while earlier successful migrations remain applied. Treat this as an additional safety net, not as a replacement for the verified external export and Time Travel bookmark.

## 7. Migration and deployment order

After the preceding checks and explicit approval:

1. Merge PR #152 only after final code review and remaining feature-level acceptance.
2. Confirm the legacy Pages production deployment remains frozen and the new Pages target remains paused.
3. Complete the external D1 export and fresh Time Travel bookmark; verify the backup checksum and access.
4. On `main`, manually dispatch **Deploy Cloudflare Worker** with the exact production target `naughtyfamily-api` and the external backup reference. The protected workflow applies pending D1 migrations, verifies the exact migration ledger, deploys the renamed Worker, then checks `/health`, D1 health, and key-encryption readiness.
5. Confirm the production ledger includes the approved portal migration files through `0037_private_data_visibility.sql`. Run the approved integrity and foreign-key checks and verify the event-history, Gym Training, consent, private-data-visibility, and member-key-capability schemas and expected row preservation.
6. Verify the production Worker accepts CORS from `https://naughtyfamily.pages.dev`.
7. Run authenticated smoke tests with a standard member and an administrator: sign-in, session, company data refresh, member settings, public faction endpoints, consent-gated feature endpoints, and admin authorization. Confirm no private data is exposed to another member.
8. Build with `VITE_API_BASE_URL=https://naughtyfamily-api.kboone801.workers.dev` and manually publish `dist/` to Pages project `naughtyfamily`. Do not publish the portal bundle to the legacy `naughty-company-dashboard` project.
9. Verify the new Pages root, JavaScript bundle API URL, browser CORS, sign-in, company refresh, and critical workspace flows. The preserved legacy Pages deployment currently points at the retired `naughty-company-api` Worker hostname and is **not** a verified rollback until it is rebuilt and checked against `naughtyfamily-api`.
10. Record the deployed Worker version, Pages deployment ID, exact D1 migration ledger, backup reference/checksum, rollback bundle verification, and smoke-test results in the release record.

## 8. Rollback plan and limitations

### Worker code rollback

The active production Worker version observed during the 2026-11-13 refresh was `af3b0630-c758-4910-9a41-d43c8c330960` (100% traffic). Re-read the active deployment immediately before portal cutover and record that exact pre-release version ID for any code rollback.

Cloudflare supports:

```sh
npx wrangler rollback <PREVIOUS_VERSION_ID> --name naughtyfamily-api
```

A Worker rollback changes code deployment, not D1 schema or data. Cloudflare also warns that bindings are not rolled back and older code may fail against changed data structures. Prefer a forward-fix migration when the schema has changed, and only roll code back after confirming compatibility with the migrated schema.

### Pages rollback

The legacy project remains at `https://naughty-company-dashboard.pages.dev`, with current PR #155 deployment `b0352cf1-db23-437e-87b4-a363d08b53b8` preserved. It is the immediate fallback destination if the new `naughtyfamily` cutover fails.

The new `naughtyfamily` project currently has no production deployment, so there is no prior deployment inside that project to roll back to before its first release. After the first successful production deployment, Cloudflare Pages can roll back to an earlier successful production deployment in that same project. For the first cutover, keep the legacy project and deployment available and document the user-facing fallback URL.

### D1 data rollback

Use the fresh pre-migration Time Travel bookmark for point-in-time restore only as a last resort, with explicit approval and after assessing all writes made since that bookmark. Restoring D1 rewinds the database itself; it is not an application-only rollback and can discard legitimate writes created after the restore point.

Prefer forward fixes for schema/application defects. If restoring is unavoidable:
- Stop writes and scheduled/queue activity through an approved maintenance action.
- Take a second backup of the current, post-failure database before restoring.
- Restore using the captured bookmark or timestamp, following Cloudflare's Time Travel procedure.
- Reconcile any valid post-bookmark writes from the post-failure export.
- Deploy code compatible with the restored schema.
- Verify ledger, integrity, foreign keys, authentication, company/history records and all critical routes before reopening traffic.

Do not run a restore or overwrite production D1 as part of a routine application rollback.

## 9. Remaining production gates

- [x] Operator-confirmed real-key permission/consent acceptance for private bars/cooldowns, optional detailed networth, and Halloween historical summaries/logs, as recorded in the PR's validation history. This does not replace the staging functional acceptance still required for the latest Halloween dashboard changes.
- [x] Admin/non-admin end-to-end acceptance on the isolated staging Worker/D1/Pages environment, including the synthetic administrator and denied non-admin paths. Production authorization has not been switched.
- [x] Physical Android TalkBack/layout review, automated accessibility checks, sustained staging load and read-only production request-budget review. Device/version details and granular per-control/table outcomes remain documented limitations.
- [x] Full production D1 export completed, SQL checksum verified, and AES-256 archive uploaded outside the repository; owner should retain a downloaded copy separately.
- [x] Isolated production-data restore rehearsal completed; 40 application tables, 22 explicit indexes and 934 rows matched, with zero D1 foreign-key violations. Direct D1 PRAGMA integrity_check remains unavailable through the REST API; exact normalized SQL passed local SQLite integrity_check.
- [x] Current production Time Travel bookmark re-read and recorded at 2026-11-14 04:23:12.859 UTC. The value is unchanged from the export-time bookmark; Cloudflare automatically generates bookmarks and does not offer manual snapshot creation. Re-read immediately before migration if anything changes or time passes.
- [x] Production migration ledger and schema rechecked read-only at 2026-11-14 04:24 UTC: 16 migrations, 41 tables; last applied migration remains `0012_company_ranking_snapshots.sql`. Portal-specific `0012_administrator_registry.sql` and `0013`–`0025` remain pending.
- [x] Production Worker secret binding names inspected without reading values. `KEY_ENCRYPTION_SECRET`, `TORN_API_KEY_CUSTOM`, and `TORN_FACTION_API_KEY` are present. The optional dedicated `TORN_API_KEY_FULL_ACCESS` binding is not configured; the portal code falls back to the Custom Access service key for the public global-ranking path. That fallback must be functionally accepted on staging before release.
- [ ] Functional acceptance on the current release candidate in isolated staging: Live/current-year and Historical/all-time/year-specific scopes, member comparisons, partial-coverage behavior, Revitalize proc percentage and exact numerator/denominator, plus critical admin/member flows. The latest quality gates are not a substitute for this runtime acceptance.
- [ ] Explicit owner approval to merge PR #152, dispatch the production Worker migration/deployment workflow, and publish the new `naughtyfamily` Pages target.
- [ ] Post-deployment smoke tests completed and rollback operator available.

## 10. Current production changes versus the separate portal cutover

The existing Company Dashboard release is live; the Naughty Family portal branch is not.

Completed before this state refresh:
- PR #155 merged at `f0420232231fa9708cece921a4fd5921eaad8e71`.
- Production D1 migration `0012_company_ranking_snapshots.sql` applied successfully.
- Production Worker deployed as version `af3b0630-c758-4910-9a41-d43c8c330960`, 100% traffic.
- Existing Pages project manually deployed from Android; canonical deployment `b0352cf1-db23-437e-87b4-a363d08b53b8`; user confirmed Trends & Charts displays the correct data.
- Automatic production/preview Git deployments on the legacy Pages project remain disabled.

Not performed for the separate Naughty Family portal cutover:
- Full production D1 SQL export backup has been created, checksummed, and packaged in an AES-256 archive outside the repository. An import-normalized derivative passed an isolated D1 data restore rehearsal; the original export remains unchanged in the archive.
- No portal migrations `0012_administrator_registry.sql` or `0013`–`0025` have been applied to production.
- No portal-branch Worker has been deployed to production.
- No production deployment has been created for the `naughtyfamily` Pages target.
- No production rollback/restore has been performed.

The portal branch Worker deployment workflow remains manual-only and requires the explicit `naughty-company-api` target plus an operator-supplied backup reference. That manual reference input is still not an automated check of backup contents; the owner must supply the verified archive reference at release time. The backup now exists and has passed the isolated restore rehearsal documented above. This workflow safeguard becomes effective after merge. This section is a state clarification, not authorization to deploy.

## 11. Final release review (2026-11-14 04:24 UTC)

### Read-only production evidence

- Production D1 identity was verified as `naughty-company-dashboard` / `bbbe128a-c5cc-46ec-b8ef-93860183e795`. A read-only schema query returned 41 tables (including Cloudflare's internal `_cf_KV` table) and a read-only `d1_migrations` query returned 16 records, ending with `0012_company_ranking_snapshots.sql`. No portal migration has been applied.
- The current production Worker deployment is `naughty-company-api`, version `af3b0630-c758-4910-9a41-d43c8c330960`, serving 100% traffic from deployment `c1705050-3a5b-424d-bd1d-50a71c185fcc` (created 2026-11-13 20:00:55 UTC).
- Legacy Pages project `naughty-company-dashboard` remains on successful production deployment `b0352cf1-db23-437e-87b4-a363d08b53b8` (2026-11-13 20:23:19 UTC). Its Git automatic production/preview deployments are disabled.
- Separate Pages project `naughtyfamily` has no production deployment. Its automatic production/preview Git deployments are disabled. It remains the intended target for the future portal deployment; the legacy Pages project remains the fallback.
- Production Worker secret binding names were read without accessing values. `KEY_ENCRYPTION_SECRET`, `TORN_API_KEY_CUSTOM`, and `TORN_FACTION_API_KEY` are present. `TORN_API_KEY_FULL_ACCESS` is absent; the branch code has a Custom Access fallback. Do not change secrets as part of this review.
- The branch Worker deployment workflow was inspected. It is `workflow_dispatch` only, requires the `main` ref, explicit `naughty-company-api` target, and a non-empty external-backup reference. It independently verifies the production Worker/D1 names and IDs. The reference input is not cryptographic validation of backup contents; the operator remains responsible for checksum/access verification.

### PR and validation evidence

- PR #152 remains OPEN/DRAFT. No GitHub review approvals or inline review threads are recorded. The branch has no commits behind current `main` (merge base `097762ac6f1d8afc071b37c1518f235073834644`).
- Latest release-candidate code commit reviewed: `a9f4d8b8e10c7ed7eb5832c6bd9711f65d444361`.
- [Quality Gates #1021](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/43556243253) passed TypeScript, production frontend build, staging harness syntax checks and backend regression tests. [Discord Bot Quality Gates #123](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/43556243261) also passed.
- The prior full isolated D1/Queue staging integration and sustained-load acceptance remain valid for the code they tested, but they predate the latest Halloween event-year/member-comparison and Revitalize-rate changes. No functional staging deployment/acceptance was performed on this exact release candidate; CI does not prove runtime behavior against staging D1/Queue/Pages.
- The current bookmark was read again at 04:23:12.859 UTC and matched the export-time bookmark. Cloudflare documents that bookmarks are generated automatically; this was a fresh read of the current token, not a separately minted backup snapshot.

### Release decision

**NO-GO for production cutover.** The production baseline, external SQL backup/restore rehearsal, current Time Travel bookmark, target isolation and manual deployment safeguards have been reviewed. Before any merge/deployment, complete functional staging acceptance on this exact release candidate, resolve/accept the Custom Access fallback for the public global-ranking service-key path, and obtain explicit owner approval. After approval, take another current bookmark immediately before migration, verify the external backup is accessible/checksummed, recheck pending migration filenames, then follow Sections 7–8. This review did not merge the PR, change its draft status, deploy Worker/Pages, run SQL writes, apply migrations, modify secrets, or restore production D1.

## 12. Post-sync branch and environment refresh (2026-11-14 19:56 UTC)

**Scope:** read-only GitHub/Cloudflare verification after synchronizing `portal-rebuild` with `main`. This is not production-release approval.

### Branch synchronization

- The GitHub branch merge completed successfully without conflicts. Merge commit: [`a333a2292b5bb154f59bb14e3d64e7ebd2787b42`](https://github.com/SharpSplinter/Naughty-Company-Dashboard/commit/a333a2292b5bb154f59bb14e3d64e7ebd2787b42), message: “Merge current main into portal-rebuild”.
- Merge parents are the previous portal head `e8d3b3c45101bb966e4fb3b8a6adc88e64f1a421` and current `main` head `ddb0257f8d99905f9e1fc3080e7c4d1ea2b36a8b`.
- GitHub compare `main...portal-rebuild` reports status `ahead`, 689 commits ahead and **zero commits behind**. Merge base equals current `main` at `ddb0257f8d99905f9e1fc3080e7c4d1ea2b36a8b`.
- PR #152 remains OPEN/DRAFT and GitHub reports it mergeable. No submitted PR reviews or inline review threads were returned. The two prior quality-gate successes (runs #43631623195 and #43631623177) predate this merge commit; they are not validation of the synchronized HEAD. The staging workflow below runs its own typecheck, backend tests and production frontend build.

### Complete portal migration chain

The current branch carries the portal migration chain through `0031_torn_event_calendar_windows.sql`. Production currently has 16 migration entries and ends at `0012_company_ranking_snapshots.sql`; exact filename matters because `0012_administrator_registry.sql` is a distinct pending migration. The 20 portal-specific pending files are `0012_administrator_registry.sql` and `0013` through `0031`. The added migrations after the previous 0025 cutover-review ceiling are:

| Migration | Schema/data effect |
|---|---|
| `0026_halloween_attack_outcome_metrics.sql` | Adds successful-attack and lost/stalemated-attack totals plus an outcomes-version field to per-member Halloween attack jobs |
| `0027_halloween_exchange_market_price_cache.sql` | Creates a shared public item-market average-price cache keyed by Torn item ID |
| `0028_christmas_town_archive.sql` | Creates owner-scoped encrypted Christmas Town history credentials, per-member/year collection jobs and event logs, with supporting indexes |
| `0029_halloween_historical_event_years.sql` | Seeds known October 25–November 1 historical Halloween event windows for 2021–2025, preserving existing rows |
| `0030_event_history_consent_records.sql` | Creates per-player Halloween/Christmas Town initial-consent records and backfills records from existing keys and collection jobs |
| `0031_torn_event_calendar_windows.sql` | Adds source/confirmation metadata to event windows and member slots; creates the per-player Torn event-calendar cache and index |

Together with the previously reviewed migrations 0012–0025, this brings the portal release's pending production chain to 20 exact migration filenames. The isolated staging D1 has already recorded 36 migrations through `0031_torn_event_calendar_windows.sql` and 72 tables. Staging ledger evidence is not proof that production has applied any of these migrations.

### Current production baseline (read-only recheck)

- Production D1: `naughty-company-dashboard`, UUID `bbbe128a-c5cc-46ec-b8ef-93860183e795`. The read-only migration query still returns 16 entries, ending at `0012_company_ranking_snapshots.sql`. The SQLite catalog query returned 42 table names including Cloudflare's `_cf_KV` and SQLite's `sqlite_sequence`; no writes were made.
- The current D1 Time Travel bookmark read during this refresh is `000004ca-000007b8-00005123-478147ed475d7c4eb4a1ec783f8bcffa`. Bookmarks are automatically generated; re-read immediately before migrations and verify that the encrypted external backup remains accessible and checksummed.
- Production Worker `naughty-company-api` remains on version `af3b0630-c758-4910-9a41-d43c8c330960`, deployment `c1705050-3a5b-424d-bd1d-50a71c185fcc`, serving 100% traffic. Live binding names still include legacy `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH`, `DB`, `GLOBAL_RANKINGS_QUEUE`, `KEY_ENCRYPTION_SECRET`, `TORN_API_KEY_CUSTOM` and `TORN_FACTION_API_KEY`. `TORN_API_KEY_FULL_ACCESS` remains absent. Secret values were not read.
- Legacy Pages project `naughty-company-dashboard` remains the live fallback, with latest known successful deployment `b0352cf1-db23-437e-87b4-a363d08b53b8`. Separate production Pages project `naughtyfamily` still has no production deployment. Production and preview automatic Git deployments remain disabled for both projects.

### Isolated staging baseline before manual run

- Staging D1: `naughtyfamily-acceptance-staging`, UUID `02cca699-1232-495f-8a0a-de525058b92a`, with 36 migration entries through `0031_torn_event_calendar_windows.sql` and 72 tables. This is a separate database from production.
- Latest successful `naughtyfamily-staging` Pages deployment observed before the manual rerun: deployment `4a20a907-340b-44ca-8cec-b619544f3446`, 2026-11-14 18:51:56 UTC, commit `ec43ebfa8535e597bd103b9cf46f15742b6915e8`. The staging Worker also received a deployment at approximately 18:51 UTC. Deployment success does not by itself prove every later GitHub acceptance step completed.
- The merged head includes the Discord reconnect UI commit after that Pages deployment. The staging workflow's push path list does not include `src/components/floor/alerts-panel.tsx`; therefore the manual staging dispatch is required to deploy and validate this UI change as part of the synchronized branch.
- The manual workflow is `.github/workflows/deploy-staging-acceptance.yml`, dispatched on ref `portal-rebuild` with input `confirm_target=naughtyfamily-staging`. It runs repository typecheck, backend tests and frontend build; verifies staging-only D1/Queue/Worker targets; applies pending migrations to the staging D1; deploys the staging API Worker; checks API health, DB, encryption readiness and browser CORS; builds and deploys the staging Pages project with the staging API URL; runs responsive and authenticated admin/non-admin/accessibility/request-budget checks; performs a 285-second read-only sustained request test at 5 requests/second; and cleans synthetic private-history fixtures in an `always()` step.
- This acceptance workflow does not replace the separately scoped explicit functional walkthrough for every Halloween/Christmas feature. Review the exact workflow result and, where not covered by its automated steps, verify Halloween Live/current-year and Historical all-time/year-specific views, member comparisons, partial coverage and Revitalize numerator/denominator, Christmas Town archive views, Torn calendar windows, and Discord reconnect/`/link-code` before production approval.

### Manual isolated staging acceptance result (2026-11-14 19:57–20:04 UTC)

[Run #43634883077](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/43634883077) completed **SUCCESS** on `portal-rebuild` at exact tested HEAD `b6fee3526614bbf97caff2281222918f9b29fcd4`. This HEAD includes merge commit `a333a2292b5bb154f59bb14e3d64e7ebd2787b42` and the initial cutover-review refresh. The run completed all 25 job steps successfully.

- Repository typecheck, backend test suite and production frontend build passed.
- Explicit staging-target checks passed. Staging-only Queues were provisioned; migrations were applied/listed against `naughtyfamily-acceptance-staging` only. Its ledger remains 36 entries through `0031_torn_event_calendar_windows.sql`.
- The isolated staging API Worker deployment succeeded. `/health` returned HTTP 200 with database and key-encryption readiness `ok`; CORS origin matched, and OPTIONS preflight returned 204.
- Pages deployed successfully to the separate `naughtyfamily-staging` project. The deployment was `https://500dbeae.naughtyfamily-staging.pages.dev`; the stable staging origin returned HTTP 200, included the root mount and JavaScript asset, and its bundle contained the staging API Worker URL.
- Responsive Company workspace checks passed at eight viewports, including Trends data and Rankings/Faction navigation. Account Settings bounds/card-spacing checks passed at eight viewports.
- Admin role enforcement passed: admin recognized, ordinary member denied, anonymous request 401, and eight representative member admin attempts 403. Non-admin browser denied direct admin navigation. Admin UI opened all nine sections with grant/refresh actions disabled; the walkthrough made 15 GETs and zero mutations.
- Automated accessibility scan covered 11 screens with zero axe violations (zero serious/critical). Android viewport emulation covered four portrait/landscape sizes with no document-level horizontal overflow. This remains automated/emulated testing, not a substitute for the separately recorded physical-device TalkBack review.
- Request-budget smoke passed for 22 admin GETs in two five-request bursts: p50 351.6 ms, p95 681.5 ms, max 1,582.1 ms.
- Sustained read-only load passed for 285.1 seconds: 1,425 requests at 5 requests/second, observed concurrency 4, zero failures, p50 336.4 ms, p95 487.1 ms, p99 581.8 ms, max 1,459.6 ms.
- The `always()` cleanup passed and removed synthetic private-history users, sessions, company rows and history from staging D1. Screenshot artifact `company-dashboard-staging-validation` uploaded as artifact [14129902331](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/43634883077/artifacts/14129902331) (14,580,952 bytes).

**Coverage limit:** this workflow validates the portal staging foundation, general member/admin flows, accessibility, responsiveness and request budget. It does not itself record a dedicated interactive walkthrough of the newest Halloween Live/Historical scopes, all-time/year-specific member comparisons and Revitalize numerator/denominator, Christmas Town event archive, Torn calendar window behavior, or the Discord reconnect/`/link-code` experience. Those remain explicit release-candidate feature checks before production approval.

### Updated release decision

**NO-GO for production cutover pending feature-specific acceptance, the service-key decision, and explicit release approval.** The manual isolated staging acceptance on the synchronized branch passed. The branch synchronization and this staging deployment do not authorize a production change. The public global-ranking path still prefers `TORN_API_KEY_FULL_ACCESS` and falls back to `TORN_API_KEY_CUSTOM`; the production Worker does not currently have the dedicated Full Access binding. Functionally accept the configured fallback in isolated staging or supply and test a dedicated compatible Full Access service key.

The next controlled sequence is: complete the feature-specific checks listed above; resolve the service-key question; obtain explicit release approval; re-read production's current bookmark and exact migration ledger immediately before the change; then, only after approval, merge PR #152 and manually dispatch the protected production Worker workflow from `main` with the explicit `naughtyfamily-api` target and independently verified external backup reference. Publish the separate `naughtyfamily` Pages target only after production API health is confirmed. Keep the legacy Pages deployment available as the UI fallback.

No production SQL writes, migrations, Worker/Pages deployments, restores, secret changes or PR merge were performed during this refresh.

## 13. Production target and master service-key update (2026-11-15 00:14 UTC)

This section supersedes earlier production Worker-name and Full Access-secret observations above.

### Live Cloudflare configuration verified read-only

- The production API Worker is now `naughtyfamily-api`, with intended endpoint `https://naughtyfamily-api.kboone801.workers.dev`. Cloudflare lists the Worker and its most recent deployment is `f4bfb9cf-f613-4b0c-a3ea-7d30d8200093`, version `54f02948-73b3-4535-bd71-8d9683ad62c9`, receiving 100% traffic. The old Worker name `naughty-company-api` now returns Cloudflare 404 “This Worker does not exist on your account.”
- Production Worker secret binding names include `TORN_API_KEY_SERVICE` (type `secret_text`), the newly supplied master Full Access service key. `TORN_API_KEY_CUSTOM`, `TORN_FACTION_API_KEY` and `KEY_ENCRYPTION_SECRET` are also present. Secret values were not read. The checked-in portal source previously referenced `TORN_API_KEY_FULL_ACCESS`; deployment must use the new `TORN_API_KEY_SERVICE` binding name. The updated branch will prefer SERVICE for shared Full Access operations and retain CUSTOM only as the global-ranking fallback.
- The production Discord bot's live `DASHBOARD_API` service binding now points to `naughtyfamily-api`. The checked-in `bot/wrangler.production.toml` was still pointing to the retired name and must be updated before a future bot deployment. Its `/link` command must direct members to the new Pages URL.
- Cloudflare Pages project `naughtyfamily` is configured with subdomain/domain `naughtyfamily.pages.dev`, production branch `main`, and automatic Git production/preview deployments disabled. It currently has **zero production deployments**. The manual Pages release workflow must build with `VITE_API_BASE_URL=https://naughtyfamily-api.kboone801.workers.dev` and deploy to project `naughtyfamily`.
- The legacy Pages project `naughty-company-dashboard` remains present, but the previous `naughty-company-api` Worker has been removed. Its existing compiled frontend still targets that retired API hostname, so the legacy Pages site is not currently a verified end-to-end rollback. Before relying on it as a fallback, either restore an old-host compatibility Worker or rebuild/redeploy the legacy Pages site against the new Worker and verify it. After the first successful production deployment, the new `naughtyfamily` project can use its own Pages deployment rollback history.
- Production D1 remains `naughty-company-dashboard` / `bbbe128a-c5cc-46ec-b8ef-93860183e795`; its migration ledger still ends at `0012_company_ranking_snapshots.sql`. Renaming the Worker and Pages target does not rename or replace the production database. The pre-migration backup and immediate Time Travel bookmark gates remain mandatory.

### Required repository alignment and release sequence

The checked-in production configuration must be consistent with the live names before the next production deployment: set `wrangler.toml` to `naughtyfamily-api` and the canonical Pages CORS origin; change the protected Worker workflow's confirmed target and health URL; change the manual Pages workflow's project and API build URL; change the frontend fallback API URL; update the health payload service identity and tests to `naughtyfamily-api`; use `TORN_API_KEY_SERVICE` in the Worker type and Full Access call sites; and align the bot's service binding and `/link` destination. A production bot deployment may be needed to publish the updated link instructions, although the live service binding has already been changed to the new API.

The master service-key binding's presence resolves the earlier “missing Full Access key” configuration blocker, but successful use by the new branch code still needs to be exercised with the updated binding name. Continue to hold production cutover until the updated branch passes quality gates and isolated staging acceptance, the remaining feature-specific Halloween/Christmas/Torn-calendar/Discord-link walkthrough is complete, explicit owner approval is recorded, the external backup is independently verified, and the fresh D1 bookmark plus exact pending migration ledger are rechecked immediately before production migration.

No production D1 writes, migrations, Pages deployment, or portal Worker code deployment were performed as part of this read-only configuration discovery.

## 14. Repository alignment and final master-key staging acceptance (2026-11-15 00:37 UTC)

This section supersedes the outstanding repository-alignment items in Section 13.

### Production configuration and source alignment

- The checked-in production Worker target is now `naughtyfamily-api`; `wrangler.toml` keeps the existing production D1 database ID/name and sets the canonical CORS origin to `https://naughtyfamily.pages.dev`.
- The protected production Worker workflow confirms `naughtyfamily-api`, validates the existing `naughty-company-dashboard` D1 ID, and probes `https://naughtyfamily-api.kboone801.workers.dev/health`. Production deployment remains manual-only from `main`, requiring explicit target confirmation and an external backup reference.
- The manual Pages workflow builds with `VITE_API_BASE_URL=https://naughtyfamily-api.kboone801.workers.dev` and publishes to the separate `naughtyfamily` Pages project. Frontend fallback URL and health payload service identity now use `naughtyfamily-api`.
- The Worker source now prefers production `TORN_API_KEY_SERVICE` for shared Full Access service calls. It retains `TORN_API_KEY_FULL_ACCESS` only as a compatibility alias for the current isolated staging Worker until its old secret name can be retired. Public global rankings use SERVICE first, then the staging compatibility alias, then the Custom Access service fallback; no service path substitutes a member's private credential.
- The Discord bot's checked-in Wrangler service binding now names `naughtyfamily-api`, its source `/link` instruction points at `https://naughtyfamily.pages.dev`, and the live production bot's `DASHBOARD_API` service binding was independently verified pointing to `naughtyfamily-api`. The bot source change is in the PR; this review does not claim a new production bot code deployment.
- Cloudflare's read-only production Worker check still showed deployment `f4bfb9cf-f613-4b0c-a3ea-7d30d8200093`, version `54f02948-73b3-4535-bd71-8d9683ad62c9`, at 100% traffic. This is the already-existing renamed production Worker version, not a deployment of the PR's Worker code.
- Live production secret *names* include `TORN_API_KEY_SERVICE`, `TORN_API_KEY_CUSTOM`, `TORN_FACTION_API_KEY` and `KEY_ENCRYPTION_SECRET`; no secret values were read. The old Worker name `naughty-company-api` remains removed/404. Pages project `naughtyfamily` remains configured at `https://naughtyfamily.pages.dev` with zero production deployments.
- Production D1 remains `naughty-company-dashboard` / `bbbe128a-c5cc-46ec-b8ef-93860183e795`. The final read-only ledger check still returned 16 migration records ending `0012_company_ranking_snapshots.sql`. No production migration was applied.
- The legacy Pages project `naughty-company-dashboard` still serves its old compiled API URL. Since the old Worker hostname no longer exists, that site is not a verified operational rollback. Preserve it as an archived prior deployment, but do not rely on it for rollback unless a compatibility Worker is restored or the legacy Pages project is rebuilt against the new API and verified.

### Final isolated staging acceptance with service-key compatibility

[Manual staging acceptance run #43658512441](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/43658512441) completed **SUCCESS**, all 25 job steps, on branch `portal-rebuild` at tested HEAD `e4e48e62b52b0e79630999d6c927d586e9b30d3e`.

- Typecheck, backend regression tests, frontend production build, and explicit staging-only Worker/D1/Queue checks passed.
- Staging D1 migrations were applied and verified through `0031_torn_event_calendar_windows.sql`; production D1 was not targeted.
- The staging Worker deployed with the `TORN_API_KEY_SERVICE`-first helper and legacy `TORN_API_KEY_FULL_ACCESS` compatibility binding. Staging API `/health` returned 200 with database/encryption readiness `ok`; CORS was correct. The staging Pages origin returned 200 and its bundle embedded the staging API URL.
- Responsive Company workspace checks passed at eight viewports. Admin/non-admin checks, keyboard/semantic navigation, automated accessibility scan and read-only request-budget smoke passed. The accessibility scan covered 11 screens with zero axe violations.
- Sustained read-only staging load passed for 285 seconds and 1,425 requests at 5 requests/second, observed concurrency 3, zero failures, p50 120.4 ms, p95 166.5 ms, p99 304.1 ms and max 577.3 ms.
- Synthetic private-history fixtures were removed successfully. Screenshot artifact [company-dashboard-staging-validation, ID 14139094009](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/43658512441/artifacts/14139094009) uploaded (14,625,231 bytes).

This establishes successful isolated acceptance of the branch's renamed Worker/Pages endpoints and its SERVICE-first/legacy-staging-binding compatibility logic. The production SERVICE secret's value was never read or copied to staging; the test run used only the isolated staging Worker's existing configured bindings. It does not, by itself, constitute a production traffic cutover or prove the production secret's external Torn permissions by making a live production call.

### Remaining production release gates

**Production cutover remains NO-GO until the following are completed:**

1. Complete an explicit feature walkthrough of Halloween Live/current-year and Historical all-time/year-specific views, member comparisons, partial coverage and Revitalize numerator/denominator; Christmas Town archive; Torn event calendar windows; and Discord reconnect/`/link-code`.
2. Record explicit owner approval for PR #152 and the production migration/Worker deployment/Pages publication. PR #152 remains OPEN/DRAFT after this staging result.
3. Immediately before migration, independently verify the encrypted external D1 backup and checksum/access, re-read the current production D1 Time Travel bookmark, and read the exact pending production migration ledger again.
4. After the approved merge, manually dispatch the protected production Worker workflow from `main` using target `naughtyfamily-api` and the verified backup reference. Apply the ordered portal D1 migrations, deploy the Worker, verify health/encryption and service-key behavior, then manually publish the separate `naughtyfamily` Pages project.
5. Run production smoke tests and retain an available rollback operator. The legacy Pages deployment is not a working API fallback while it points at the removed Worker hostname; prepare and verify a real fallback before relying on it.

No production portal migrations, portal Worker code deployment, `naughtyfamily` Pages production deployment, PR merge or secret-value access was performed during this update.

## Cloudflare references

- [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [D1 Wrangler commands and migrations](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Cloudflare Pages branch deployment controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/)
- [Cloudflare Pages rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/)
- [Cloudflare Worker rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)


## 15. 2026-11-16 release-gate refresh (candidate `portal-rebuild`)

**Runtime candidate used by the Christmas Town/Gym Training feature runs:** `ad08d8f11400b7478ba514e3d8cc30fbc6a2e709`  
**Code/workflow branch head immediately before this documentation-only refresh:** `113d4c922679cb3f694704c9a1c34f17eab77201` (subsequent commits were workflow/script and documentation changes; no Worker runtime source change)
**Decision:** **NO-GO for production cutover.** This update is scoped to the `portal-rebuild` source branch and read-only production metadata inspection. No production Worker/Pages deploy, production D1 query or migration, secret change, or administrator-data mutation was performed.

### Current candidate acceptance

| Area | Result | Evidence |
|---|---|---|
| Halloween | Accepted by owner | Owner-confirmed validation on the current candidate; not rerun |
| Consent / Privacy | Accepted by owner | Owner-confirmed validation on the current candidate; not rerun |
| Discord | Accepted by owner | Owner-confirmed validation on the current candidate; not rerun |
| Christmas Town | **PASS** | [Staging workflow #316](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/43792813370), selected `christmas-town` suite |
| Gym Training | **PASS** | [Staging workflow #317](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/43793005243), selected `gym-training` suite |

Both feature runs checked out this exact candidate from `portal-rebuild`, passed repository quality gates, verified isolated staging targets, applied any pending migrations to staging D1 only, deployed the staging Worker and Pages bundle, executed one selected feature suite, passed the configured D1 budget checks, removed synthetic private-history fixtures, and completed the final budget check. The Gym Training suite verified the private-history response, two synthetic records, and idempotent handling of a collection request when the archive is already complete. The Christmas Town suite verified the normalized 2026 calendar window and synthetic historical archive. These are staging acceptance results, not production acceptance.

### Torn event-calendar integration

The current-candidate repository quality gates passed. The package test suite includes `scripts/test-torn-event-calendar-windows.mjs`, which checks the Worker/UI/migration contract for the Torn V2 calendar endpoints, six-hour cache, nominal versus personal event windows, historical fallback/confirmation behavior, and Christmas Town year gating.

The separate [Torn calendar API probe run #3](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/43793004998) also passed on this candidate. It made read-only GET requests to Torn V2 `/torn/calendar` and `/user/calendar` using the repository Actions secret `torn_api_key`, and validated the expected response structures.

**Acceptance boundary:** the source-contract tests and upstream Torn endpoint probe passed, but the selected Christmas Town staging feature suite intentionally reads a synthetic cached calendar fixture and makes no Torn call. The API probe does not traverse the authenticated portal Worker route, and its repository secret is not proof that the production Worker binding `TORN_API_KEY_SERVICE` is authorized. Therefore this is upstream/API-contract acceptance, not a complete live member-to-Worker-to-Torn end-to-end acceptance. Keep the live integration gate open until it is exercised with an authorized member session in an isolated environment and the returned Torn window is observed through the portal route.

A queue-free authenticated staging E2E attempt was added to the existing Torn calendar probe workflow and run from `portal-rebuild`: [run #43793815930](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/43793815930). The checkout, script syntax, upstream Torn probe, and D1 budget preflight passed. The E2E script then found that the Torn player associated with the repository key already has a row in staging D1 and **failed closed before sign-in, key save, calendar-route request, or cleanup**. No existing staging identity was overwritten or deleted. The final D1 budget check passed with the run's recorded baseline unchanged at 3,985,750 rows read for the UTC day. Thus the live authenticated portal-route acceptance remains open; provide a dedicated test member/key or authorize a safe strategy for using the existing staging identity without replacing its stored connection.

### Migration inventory through 0037

The current `migrations/auth` chain contains 42 SQL files. The previous review's migration inventory ending at `0031_torn_event_calendar_windows.sql` is superseded. The following later migrations are present on this candidate:

| Migration | Change |
|---|---|
| `0032_portal_first_login_consent.sql` | Creates centralized first-login/policy consent state, historical-collection and sharing preferences, and its lookup index |
| `0033_gym_training_history.sql` | Adds member-owned Gym Training key metadata, collection jobs, event-log history, and supporting indexes |
| `0034_portal_api_key_usage_consent.sql` | Adds API-key usage consent, acknowledgement timestamp, and key fingerprint |
| `0035_portal_api_key_access_type.sql` | Adds the constrained `custom` / `full` access-type declaration |
| `0036_admin_read_path_indexes.sql` | Adds indexes for company/player administrative read paths and faction membership boundary queries |
| `0037_private_data_visibility.sql` | Adds private-data visibility preferences, member-key capability metadata, and supporting indexes |

The current-candidate staging workflows verified and applied the pending migration chain to the isolated acceptance D1. This does not substitute for a replay against a restored copy of production data.

### Restored-production-backup rehearsal status

The earlier isolated restore rehearsal is still the last evidenced backup replay: normalized SQL SHA-256 `1188579647f91ad310ec9069eaedd2e896c591a2f7e3ac5365474fb790a34ab2`, source archive SHA-256 `052e5bcf352d17ae988eae15ff051e76c5380259c19dc0c694de5611c2c7fb4b`, 1,270 statements, 40 tables, 22 explicit indexes, 934 application rows, matching local replay table counts, and zero foreign-key violations. That restored copy's migration ledger ended at `0012_company_ranking_snapshots.sql`. It did **not** replay migrations `0013` through `0037`.

I searched the currently available conversation/Project/Library files for the referenced production archive and normalized SQL but could not retrieve the restore input. A read-only Cloudflare D1 database metadata listing also found no retained database named for the prior restore rehearsal. The two old October companion JSON exports are not a full D1 database backup and were not substituted. Consequently, a fresh replay of migrations `0013` through `0037` against the restored production backup is **blocked**, not passed. Do not run that replay against production D1. Make the encrypted archive and its authorized decryption material available in the working environment, then restore to a newly isolated temporary D1 and verify counts, migration ledger, foreign keys, and key business-history preservation before deleting the rehearsal database.

### Production service credential authorization

Cloudflare secret-binding metadata previously confirmed that production Worker `naughtyfamily-api` has a `TORN_API_KEY_SERVICE` secret binding. The binding name/type proves configuration presence only; it does not expose the value or prove Torn authorization, access selections, or key validity.

No existing safe, unauthenticated read-only production diagnostic was found that calls Torn with that exact secret. The `/api/me/training-calculator` GET path uses `TORN_API_KEY_SERVICE` for the public `/torn/gyms` request, but requires a live member session and also performs other member-scoped Torn requests; it was not invoked without an authorized session. The calendar API probe above uses the separate repository Actions secret, not this Worker secret. Accordingly, production `TORN_API_KEY_SERVICE` authorization/permission remains **UNVERIFIED**. No secret value was read, changed, rotated, or emitted. Do not infer authorization from the binding listing.

### Rollback Pages compatibility check

Cloudflare Pages project metadata for legacy `naughty-company-dashboard` confirms its current production configuration and latest deployment still build with:

```text
VITE_API_BASE_URL=https://naughty-company-api.kboone801.workers.dev
```

The latest legacy Pages deployment is `b0352cf1-db23-437e-87b4-a363d08b53b8` (2026-11-13, source commit `097762ac6f1d8afc071b37c1518f235073834644`). The active renamed production API target is `naughtyfamily-api` at `https://naughtyfamily-api.kboone801.workers.dev`. Therefore the preserved legacy Pages bundle is **NOT a verified rollback** against the renamed Worker: its recorded production build configuration still points at the retired hostname. The project has not been rebuilt or redeployed as part of this verification. Updating its environment and publishing a rebuilt legacy bundle is a separate production Pages change and must be scheduled/approved as such.

### Remaining cutover gates

1. Complete authenticated live Torn calendar integration acceptance through the portal Worker route.
2. Obtain a safe, authorized read-only check that exercises the exact production `TORN_API_KEY_SERVICE` binding against Torn and reports only sanitized status/permission metadata.
3. Provide the encrypted production backup archive and authorized decryption material, then replay migrations `0013` through `0037` on an isolated restored copy and validate data preservation.
4. Rebuild and verify the legacy rollback Pages project against `https://naughtyfamily-api.kboone801.workers.dev`, with explicit approval for that Pages deployment.
5. Complete PR review/approval, reconcile the live production migration ledger immediately before cutover, confirm the rollback plan, and obtain explicit production release approval.

No production migration or deployment is authorized by this review. Production remains unchanged.


## 16. Queue free-tier capacity warning (2026-11-16 UTC)

The operator supplied a Cloudflare notification reporting **91% of the daily Queues free-tier operations limit used**, with the stated reset at `2026-11-16T00:00:00Z`. This leaves only 9% headroom at the time of that notification. Cloudflare warns that message delivery stops when the daily limit is reached.

Read-only Cloudflare Queue API inspection was performed after the alert. It did not send, receive, acknowledge, purge, or modify messages.

| Queue | Backlog | DLQ backlog |
|---|---:|---:|
| `ncd-global-rankings-refresh` (production) | 0 | 0 |
| `ncd-faction-performance-integration` | 0 | 0 |
| `ncd-naughtyfamily-staging-collection` | 6 | 0 |

The production `naughtyfamily-api` Worker remains configured with scheduled triggers at `10 18 * * *`, `10 0 * * *`, and `*/5 * * * *`, and its global-ranking queue consumer remains attached. The staging collection queue also has a consumer attached and currently shows six pending messages. Queue backlog metrics are not the account's daily operation counter and do not establish which workload used the 91%.

**Temporary operating guard:** no further queue-backed staging tests, fixture jobs, manual collection refreshes, queue replays, retries, or queue provisioning changes while the daily allowance is near the limit. Do not drain or purge the six staging messages merely to reduce the backlog; that would itself create queue operations and could discard work. Do not detach or disable the production consumer or cron triggers without an explicit operational decision, because that may interrupt expected scheduled service. Recheck the Cloudflare usage dashboard after the next UTC reset before resuming queue work. If uninterrupted queue delivery is required, evaluate the Workers Paid plan before the limit is reached.

This warning does not change the previously recorded staging feature acceptance results. No queue configuration or production deployment was modified during this check.

The same 2026-11-16 live-calendar attempt recorded an account-wide D1 rows-read baseline and final value of **3,985,750** against the workflow's **4,000,000-row hard stop**, with a recorded delta of zero. That left only **14,250 rows** below the staging hard stop at the time of the run. Do not start additional D1-backed acceptance work until the UTC usage reset has passed and account-wide D1 usage has been freshly checked.


## 17. Queues free-tier limit reached (operator alert, 2026-11-16)

The operator supplied a new Cloudflare account notification confirming that the daily Queues free-tier limit is **exhausted**:

- Daily operation limit: **10,000**
- Operations used: **10,000 (100%)**
- New message sends: **blocked**
- Stated reset: **2026-11-17 00:00:00 UTC**
- Cloudflare's stated recovery paths: Workers Paid plan upgrade after it takes effect, or the daily reset.

This supersedes the earlier 91% warning in Section 16. The earlier read-only Queue backlog snapshot remains a historical snapshot only; zero backlog does not imply that new sends are available. Queue backlog metrics do not replace the account-level daily operation counter.

**Immediate operating rule:** treat Queue producers as unavailable until a new authoritative usage check confirms the allowance has reset or Cloudflare confirms the paid-plan upgrade is effective. Do not probe by sending a message. Avoid retries, collection-job enqueue, manual refreshes, fixture producers, DLQ replays, and other actions that attempt to send Queue messages. Queue-backed application functions may return errors while the quota is exhausted.

Do not purge messages, detach consumers, delete queues, or disable production schedules as a quota workaround. Those are independent service/configuration changes and could interrupt expected processing; they were not performed. No Queue messages were sent, received, acknowledged, purged, or replayed in response to this alert. No Queue consumer, producer, Worker, Pages, secret, or production schedule was changed.

Recheck account-level Queue usage after **2026-11-17 00:00 UTC** before resuming queue-backed staging acceptance or manual collection work. If service must resume before the reset, confirm that the Workers Paid upgrade has actually taken effect first. Keep D1 reads independently paused until the D1 counter has also reset and been rechecked; the Queues reset does not reset D1 usage ahead of its own daily reset.


## 18. 2026-11-17 production Pages recovery and portal staging publication

This section supersedes the earlier statements in Sections 3, 4, 7, 8, 13, 14 and 15 about the current legacy Pages bundle still targeting the removed `naughty-company-api` Worker. The historical descriptions above are retained as an audit trail.

### Production Company Dashboard Pages-only recovery

- The live production `naughty-company-dashboard` Pages project was rebuilt from `main` and successfully deployed on 2026-11-17. GitHub Actions run [#44010742896](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/44010742896) completed successfully on commit `84d96e3cc6849afc1b96864fd2309b4b53ef7657`.
- Cloudflare Pages deployment: `02c82647-7bd2-47f7-8ffd-ec3c2e7ee3c2`, immutable URL `https://02c82647.naughty-company-dashboard.pages.dev`, production stage `success`.
- The deployed frontend was built with `VITE_API_BASE_URL=https://naughtyfamily-api.kboone801.workers.dev`. The Pages project's saved production environment variable was also updated to that same API URL, preventing a later build from reintroducing the retired hostname.
- This was Pages-only. The production Worker, D1, Queues, secrets, and production data were not changed. The existing Company Dashboard UI remains on the legacy Pages project; the separate portal target remains `naughtyfamily`.
- The static Pages publish and saved API URL are verified. No member login or authenticated API smoke was run as part of this repair. Treat the legacy site as a repaired rollback candidate, not as a fully end-to-end-tested portal rollback.

### Portal branch Pages-only staging publication

- Current branch head at deployment: `portal-rebuild` commit `576b188ee5eb5f72ad01554f8579ae9b9c2df59a`.
- GitHub Actions [Pages-only staging run #44011739256](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/44011739256) completed successfully.
- Cloudflare deployment: `f2ec0ae1-a263-4f6c-b2e4-480effc246eb`, immutable URL `https://f2ec0ae1.naughtyfamily-staging.pages.dev`, published to the `naughtyfamily-staging` project. The workflow's static verification confirmed the published JavaScript bundle contains `naughtyfamily-api-staging.kboone801.workers.dev`.
- Typecheck, the offline Gym Training/calculator regression, frontend build, staging-target assertions and static published-bundle verification all passed.
- The workflow did not call the staging API or deploy a Worker. It performed no D1 SQL, reads, migrations, backup operations or budget API calls, and no Queue provisioning/configuration or message operations. This confirms the staging frontend publication only; it is not a new stateful API/D1/Queue acceptance result.

### Current release metadata checked read-only

| Resource | Observed state |
|---|---|
| Production API Worker | `naughtyfamily-api` |
| Latest recorded production Worker deployment | `f4bfb9cf-f613-4b0c-a3ea-7d30d8200093` |
| Active Worker version in that deployment | `54f02948-73b3-4535-bd71-8d9683ad62c9`, 100% traffic, deployed 2026-11-15 |
| Production Worker secret bindings | `TORN_API_KEY_SERVICE`, `TORN_API_KEY_CUSTOM`, `TORN_FACTION_API_KEY`, `KEY_ENCRYPTION_SECRET` are present by name/type; values and live Torn permissions were not inspected |
| Legacy Company Dashboard Pages | `naughty-company-dashboard`, latest deployment `02c82647-7bd2-47f7-8ffd-ec3c2e7ee3c2`; saved production API URL now points to `naughtyfamily-api` |
| New portal production Pages | `naughtyfamily`, configured with `VITE_API_BASE_URL=https://naughtyfamily-api.kboone801.workers.dev`, still has no production deployment |
| Portal staging Pages | Latest deployment `f2ec0ae1-a263-4f6c-b2e4-480effc246eb`, sourced from `576b188` |

No D1 API or Queue API was called during this refresh. Therefore, the production D1 migration ledger, current Time Travel bookmark, and current account-wide D1/Queue usage counters have **not** been re-read. The 2026-11-14 migration ledger and backup/rehearsal evidence remain historical only.

### PR/base relationship and remaining cutover gates

- PR #152 remains OPEN and DRAFT. GitHub currently reports it mergeable, but `portal-rebuild` is one commit behind `main`.
- Current `main` head is `84d96e3cc6849afc1b96864fd2309b4b53ef7657`; that commit updates only `.github/workflows/manual-pages-deploy.yml` to preserve the legacy Company Dashboard Pages target and build it against the active `naughtyfamily-api`. Reconcile this mainline change into the portal release branch and rerun its quality gates before final release approval.
- The last production-data restore rehearsal replayed the backup only through `0012_company_ranking_snapshots.sql`. It did **not** replay `0013` through `0037` against restored production data. The encrypted archive/decryption input was not available in the recent review environment. This is a hard release blocker until the archive is made available to the authorized operator, the full pending migration chain is replayed against a new isolated restored copy, and row/data preservation plus foreign-key checks are recorded.
- The production `TORN_API_KEY_SERVICE` binding exists, but the secret value and its actual Torn permissions remain unverified. Binding presence alone is not acceptance evidence.
- The production D1 migration ledger and bookmark must be freshly read immediately before any approved migration. The 2026-11-14 export/bookmark cannot be treated as a fresh pre-cutover backup. Create and independently verify a current encrypted external export/checksum and capture a fresh Time Travel bookmark in the approved release window.
- A stateful staging acceptance run was not part of the Pages-only publication. Do not infer that the staging Worker, staging schema or Queue-backed collectors match this frontend bundle. Any additional stateful staging tests require explicit quota review and a narrowly selected suite; do not run broad history scans or the full acceptance workflow under the current no-D1/no-Queue operating guard.
- Keep PR #152 and production cutover **NO-GO** until the restored-data migration replay, current-candidate stateful feature acceptance, service-key permission verification, fresh backup/bookmark/ledger preflight, final code review and explicit production release approval are complete.

The production Pages recovery and the portal staging Pages publication do not authorize PR merge, production D1 migrations, production Worker deployment, production portal Pages publication, Queue operations, or production secret changes. No such operations were performed in this update.
