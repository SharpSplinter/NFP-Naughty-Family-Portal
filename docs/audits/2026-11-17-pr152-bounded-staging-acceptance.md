# PR #152 bounded staging acceptance evidence

**Acceptance date:** 2026-11-18 UTC  
**Scope:** One staging-only Worker deployment followed by the explicitly authorized bounded acceptance. This is not a claim that the full `deploy-staging-acceptance.yml` suite ran.

## Exact staging runtime

- Runtime source SHA: `f25c2980d186124441baf84184e90a3942b25ef4`
- Worker deployment workflow: [run #44219346578](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/44219346578), `worker-build-artifact.yml`, completed successfully.
- Worker target: `naughtyfamily-api-staging`
- Deployed Worker version: `9350d76a-d3c2-45b4-8ef5-ca777e617dc0`, routed to 100% of staging traffic.
- Post-deploy health: HTTP 200; database and key-encryption readiness checks passed.

## Bounded acceptance operations

Only the three explicitly designated staging resources were in scope:

- D1: `naughtyfamily-acceptance-staging`
- Collection Queue: `ncd-naughtyfamily-staging-collection`
- DLQ: `ncd-naughtyfamily-staging-dlq`

Results:

- 268 D1 rows read
- 0 D1 rows written
- 3 billable Queue operations: 1 WriteMessage, 1 ReadMessage, and 1 successful DeleteMessage
- 1 synthetic no-op message sent; it was read and successfully acknowledged/deleted
- DLQ messages: 0
- No migration was run.
- The immediate read-only backlog check reported zero. An earlier push-response backlog metric briefly showed 7; it was a best-effort approximate metric, not seven messages sent or processed. No additional Queue operation was performed to chase that discrepancy.

The bounded run stayed within the owner's cumulative limits: at most 25,000 D1 rows read, 2,000 rows written, 30 billable Queue operations, and 5 synthetic messages. The actual usage above is the metered acceptance usage, not a daily account-wide total.

## Runtime equivalence to the merged candidate

The merged PR #152 source candidate was `6323636917adf7bf14d2c516567645895def69af`. Comparing staging runtime SHA `f25c2980d186124441baf84184e90a3942b25ef4` to that candidate showed exactly two commits ahead and one changed file:

- `.github/workflows/restore-production-backup-rehearsal.yml`

No Worker, frontend, migration, or other runtime source/configuration file changed between the staging-tested runtime and the merged candidate. The allowed preflight-equivalence comparison is intentionally narrow: release automation and evidence-only files may change, but any application/runtime file change invalidates this staging evidence and requires fresh acceptance.

## Isolation and non-actions

No production D1, Worker, Pages, Torn, or Queue resource was accessed. No production deployment, migration, Pages publication, production secret change, or production Queue reconciliation occurred. No staging Pages deployment or staging migration was performed as part of this bounded run. Only the one staging Worker deployment, the read-only acceptance D1 queries, and the single synthetic no-op Queue lifecycle described above were performed.

This record documents the bounded acceptance actually authorized and performed. It does not upgrade it into a full feature-suite staging integration run.


## 2026-11-18 exact-current-runtime bounded acceptance

**Runtime source SHA: `4d4e8976feb5a86cbdeb44d25bc42b9dcc6d2d7a`**  
**Equivalent reviewed main source:** `10a41079db00a31030a838d1d34136d6847341e1` (identical Git tree `0113fbd91121e7c5edeab15c500c634811478879`).

- Staging Worker deployment: [run #44245138458](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/44245138458), `worker-build-artifact.yml`, completed successfully on the exact-current application tree.
- Staging Worker target: `naughtyfamily-api-staging`.
- Deployed Worker version: `699f7b6a-2ce7-4b79-ac7f-dbba0d852179` (version 139), uploaded at 2026-11-18T05:34:18.188097Z.
- Quality validation: npm install, typecheck, complete backend regression checks, Worker bundle, staging binding-preservation checks, and one read-only `/health` request all passed.
- Confirmed isolated staging bindings: D1 `02cca699-1232-495f-8a0a-de525058b92a`; KV `fa61636ea2cf4a39b00e255024d0fc7d`; collection Queue `ncd-naughtyfamily-staging-collection`; DLQ `ncd-naughtyfamily-staging-dlq`; origin `https://naughtyfamily-staging.pages.dev`. Existing secret binding names were preserved.
- Bounded acceptance query: `SELECT run_id FROM faction_member_stat_snapshots LIMIT 268`; **268 D1 rows read**, **0 D1 rows written**, 0 changes.
- Wider read-only diagnostic queries performed during this acceptance had a combined direct D1 query meter of 15,552 rows read and 0 rows written, below the cumulative owner-set limit of 25,000 rows read / 2,000 rows written. No fixture seeding or cleanup was performed.
- Queue baseline before sending: collection queue backlog 0; DLQ backlog 0.
- **3 billable Queue operations** were confirmed by Cloudflare Queue GraphQL analytics for the single message: 1 write, 1 read and 1 successful delete; message payload 6 bytes.
- **1 synthetic no-op message** with empty JSON body was delivered. The current Worker handler acknowledged it without a collection run or associated D1 write. Backlog returned to zero after consumption.
- **DLQ messages: 0**; the DLQ backlog remained zero.
- No migration was run. No staging Pages deployment was performed.
- **No production D1, Worker, Pages, Torn, or Queue resource was accessed.** This statement describes the staging acceptance scope; separate production release-preflight checks in the cutover review were read-only.

This record replaces the earlier runtime SHA only for the current candidate's bounded acceptance. The earlier `f25c2980` record is retained above as historical evidence. This is not a claim that the complete `deploy-staging-acceptance.yml` feature suite ran.


## 2026-11-19 snapshot-provenance and Queue-batching staging acceptance

**Runtime source SHA: `1eee1c0bb161c0902abdb090bfd3a63530e4ec25`**  
**Equivalent reviewed main application tree:** `3e2c3a964804be606d6e4867fb076d99ffb4b512` (the staging merge commit and reviewed PR #161 main commit have identical source trees).

- Exact-source staging Worker deployment: [run #44428265647](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/44428265647), `worker-build-artifact.yml`, completed successfully on `portal-rebuild`.
- Staging Worker quality validation: locked dependency install, typecheck, complete backend regression suite, esbuild bundle, staging D1/KV/Queue/secret/origin binding preservation, and one read-only `/health` request all passed.
- Staging Pages deployment: [run #44428082100](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/44428082100), completed successfully for the same application tree. Type-check, frontend regression, staging API bundle build, target isolation, Pages deployment, and published bundle verification passed.
- Staging Worker-only deployment: [run #44428033223](https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/44428033223), completed successfully for the same tree. Health returned HTTP 200 with database and key-encryption checks passing.
- Bounded staging D1 acceptance: `SELECT run_id FROM faction_member_stat_snapshots LIMIT 268`; **268 D1 rows read**, **0 D1 rows written**, and 0 changes. It used staging D1 `02cca699-1232-495f-8a0a-de525058b92a`.
- Staging Queue acceptance: backlog was empty before the test. One empty JSON no-op message was sent only to `ncd-naughtyfamily-staging-collection` (queue ID `c76e58080af04766ab0cd5d3daf76416`). The staging Queue metrics endpoint subsequently reported **backlog_count: 0** and **backlog_bytes: 0**, confirming consumption/acknowledgement and no DLQ routing.
- **3 billable Queue operations** are expected for this single message lifecycle (one write, one read, one successful delete). A per-queue GraphQL analytics query did not return an operation group in the queried interval, so this count is the standard lifecycle estimate, not claimed as a separate analytics confirmation for this run.
- No migration or fixture seeding was run for this bounded acceptance.
- The staging-only D1 and Queue activity above remained within the bounded acceptance scope. **No production D1 data, Worker, Pages, Torn, or Queue resource was changed or used for the acceptance.** Separate production D1 Insights/bookmark/ledger checks were read-only cutover-preflight evidence only.
- The portal's production cutover reserve/hard stop remains enforced by the protected production workflow; this staging record does not itself authorize a production deployment.
