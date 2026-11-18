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
