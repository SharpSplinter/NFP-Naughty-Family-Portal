# Daily D1 snapshot read cache

The Worker uses a read-through cache for the immutable daily company ranking snapshots. It is intentionally scoped to `global_company_rank_snapshots` and `faction_company_rank_snapshots`, the two tables whose primary keys are reporting-day keys and whose writers use `INSERT OR IGNORE` to lock the captured rows for that day.

## Reporting-cycle rules

- The reporting day changes at **18:00 UTC**. It is not based on midnight or the viewer's local timezone.
- The scheduled daily capture runs at **18:10 UTC** (`10 18 * * *`).
- Global snapshot reads bypass both caches until the scheduled `global_rankings_refresh_runs` job is `completed`, its source timestamp falls inside the current reporting day, and the snapshot rows exist. Faction snapshot reads bypass both caches until a row for the current reporting day exists; that table is only populated after the full faction directory passes its completeness checks. This avoids treating an automation run that merely enqueued background work as a completed data lock-in.
- A successful read is cached by SQL text, bound parameters, query kind, namespace and reporting day. The Worker keeps a bounded isolate-local LRU; Workers KV is the shared cache across Worker instances and Cloudflare locations.
- KV entries have an absolute expiration at the next **18:00 UTC** boundary. Reads use a 30-second regional cache TTL. The next day's reporting key is distinct, so a previous day's result is never reused after rollover.
- Empty `all()` results and missing `first()` rows are not cached. This allows a delayed/recovered daily snapshot to become visible if the daily job finished without producing a particular table row.
- Cache and KV errors are fail-open: the Worker reads D1 normally. The cache is an optimization, not a dependency.

## Deliberately excluded data

Live rosters and faction performance collections, current company rows, company history that can be completed by manual recovery, private live bars/networth, sessions, credentials, consent/preferences, disabled-member status, admin settings, job state, and historical event logs remain uncached by this long-lived cache. Those values can change between reporting cycles or are access/privacy decisions and must remain fresh. Weekly reports have their own immutable weekly lifecycle and are not treated as daily snapshots by this cache.

## Isolated Workers KV namespaces

| Worker configuration | KV namespace | ID |
| --- | --- | --- |
| `wrangler.toml` | `NCD_DAILY_READ_CACHE_PRODUCTION` | `9587689089c04f37b28eb9c93156cc47` |
| `wrangler.acceptance.toml` | `NCD_DAILY_READ_CACHE_ACCEPTANCE` | `fa61636ea2cf4a39b00e255024d0fc7d` |
| `wrangler.faction-performance-integration.toml` | `NCD_DAILY_READ_CACHE_FACTION_INTEGRATION` | `d7975870d0624cf39bb919f8ac9a5be7` |

The migration-only `wrangler.staging.toml` intentionally has no Worker KV binding because it is not a deployable Worker configuration. No D1 migration is needed for this cache.

## Authentication read deduplication

Authentication is memoized only within the same `Request` object and D1 binding. This avoids executing identical session, disabled-member and maintenance checks multiple times in a single request, while preserving fresh authorization on every new HTTP request. It does not cache sessions or privacy state across requests.
