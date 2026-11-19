# Naughty Family Portal

A React + Vite multi-workspace portal for Naughty Souls faction members in Torn. The portal brings the existing Company Dashboard together with Halloween event intelligence, a faction workspace, shared account settings, and role-protected administration.

## Workspaces

- `/` — member portal
- `/company` — existing company operations dashboard
- `/halloween` — current-year and historical Halloween intelligence
- `/faction` — weekly rankings and history, faction totals, live member status, recent faction activity, director directory, company income history, and weekly star distribution
- `/settings` — personal API connections and account settings
- `/admin` — administrator workspace

All workspaces use the same authenticated member session and one member-owned Torn API key. Sign-in verifies the key's Torn identity and Naughty Souls membership; the saved encrypted credential is reused for company data, private live status and optional Halloween log collection wherever its selections and the member's permissions allow.

## Faction performance roadmap

The full product specification, verified API contract, data model, implementation phases and acceptance tests are maintained in [docs/FACTION-PERFORMANCE-DASHBOARD-PLAN.md](docs/FACTION-PERFORMANCE-DASHBOARD-PLAN.md). The branch implements scheduled public roster/stat/gym-energy collection, Sunday UTC rankings, immutable completed-week reports and comparisons, faction-wide totals, public live member status, a bounded activity feed, and audited administrator-only Sunday-boundary recovery. Weekly rankings include sortable columns, status/participation/anomaly filters and current/archived member drilldowns with metric deltas and capture provenance. The portal uses one owner-verified primary sign-in key for identity and owner-only features, with optional encrypted secondary company keys scoped by the company profile returned by Torn. Staging real-key company refresh acceptance is confirmed for primary Full Access, primary Custom Access and secondary company keys; adding and removing secondary keys also passed. Private-live and Halloween feature permissions still require their own acceptance. Private-live refresh remains member-triggered and is protected by a shared 30-second per-member request throttle.

## Discord bot installation

The Discord bot's four account commands are globally registered for user-installed applications and the bot's DM. See [the Discord user-install setup](docs/DISCORD-BOT-USER-INSTALL.md) for the one-time Developer Portal setting and user install link.

## Local development

- Install Node.js 20 or later.
- Run `npm ci`.
- Run `npm run dev` to start the frontend.
- Run `npm run typecheck` to check TypeScript.
- Run `npm test` to run backend regression tests.
- Run `npm run build` to create the production static site in `dist/`.

## Cloudflare Pages

The production cutover target is the `naughtyfamily` Pages project at `https://naughtyfamily.pages.dev`. It is configured for this repository and `main`, but automatic production/preview deployments are disabled and it has not yet received a production deployment.

- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: repository root
- Production build variable: `VITE_API_BASE_URL=https://naughty-company-api.kboone801.workers.dev`
- Production branch: `main`
- Automatic production deployments: disabled
- Preview deployments: disabled

The existing `naughty-company-dashboard.pages.dev` project is preserved as a static prior deployment, but its compiled bundle still targets the retired Worker hostname and is not yet a verified end-to-end rollback. The intended production portal is `naughtyfamily.pages.dev` backed by `naughtyfamily-api.kboone801.workers.dev`. Acceptance uses the separate `naughtyfamily-staging.pages.dev` project and isolated `naughtyfamily-api-staging` Worker/D1. See [the production cutover review](docs/PRODUCTION-CUTOVER-REVIEW.md) before any production operation.

## Account security and Torn API

Members create one primary portal key on their own Torn account. The recommended Custom Access builder link is shown on sign-in; a Torn Full Access key is also accepted. The primary key's Torn owner ID is checked against the authenticated session. Company profile/employee/stock reads use that primary key by default, with optional encrypted secondary company keys scoped to the company ID returned by Torn. A secondary company key does not have to belong to the portal member's Torn player ID: it must successfully return a company profile, and the resulting company ID is saved under the authenticated portal account. Secondary keys do not replace the primary login credential or grant director permissions. Company-refresh acceptance on staging passed for primary Full Access, primary Custom Access and secondary keys. Private bars/cooldowns, optional detailed networth and Halloween summaries/logs continue to use the primary portal credential. The member separately opts into faction sharing of private bars/cooldowns and separately opts into detailed networth or historical Halloween log collection. The key is AES-GCM encrypted at rest and is never shared. Only the latest private live snapshot is retained; the owner may refresh it manually or disable its sharing, which deletes the current private snapshot. Replacing or deleting the portal key invalidates private-live/Halloween opt-in metadata and removes company-key records tied to that primary credential, while retaining company records and already-contributed Halloween archive history. Optional secondary company keys remain separate and can be removed individually in Account Settings. A shared 30-second server-side throttle applies to private-live connect and refresh attempts. The production Worker secret `TORN_API_KEY_SERVICE` is the service-owned master Full Access key for shared Torn data. It is preferred for global-company directory/ranking requests and is used for service-only Halloween market/history operations; `TORN_API_KEY_CUSTOM` remains a fallback for public global rankings, and `TORN_FACTION_API_KEY` remains dedicated to scheduled public faction collection. None of these service secrets is a substitute for a member's own key. Halloween exchange estimates use the public Torn v2 `market -> itemmarket` selection with `TORN_API_KEY_SERVICE`, never a member's personal key. Its average price and Torn `cache_timestamp` are cached by item ID in D1 and displayed with the snapshot time. The estimate is gross reward value only; it does not subtract treats spent or transaction fees.

 Christmas Town has a separate opt-in personal archive: the member explicitly enables unrestricted User → Log access, and collected seasonal logs are visible only to that member. Christmas Town history is collected in bounded December 1–31 windows for each season overlapping the selected date range. Disconnecting the feature cancels future collection but retains already collected records; rotating or removing the portal key invalidates its collection permission, and confirmed faction departure purges the personal archive. The faction-wide Halloween archive is shared with authenticated Naughty Souls members. Missing collection coverage must remain distinguishable from a true zero. Removing a saved credential must not silently erase event records already contributed to the shared archive. Each member records the Trick or Treat start time they selected in Torn: any 15-minute slot from 10:00 through 16:00 TCT (UTC). Their personal collection and live-snapshot window starts on October 25 at that time and ends on November 1 at the same TCT clock time. Members can correct the saved slot until collection or snapshot capture begins; afterward it is locked to protect the integrity of contributed data. Historical collection jobs retain the exact personal start/end timestamps they were created with.

Membership is rechecked during authenticated requests and by a bounded scheduled sweep for inactive accounts. Both paths atomically claim a per-member five-minute check window so overlapping requests and cron runs do not duplicate Torn calls. Verification state distinguishes an in-flight check, a genuine Torn outage, and a confirmed departure whose cleanup is pending. Only a genuine outage can use the short grace tied to the last successful verification (at most 15 minutes); a confirmed departure remains fail-closed until cleanup succeeds, even if Torn becomes unavailable during a retry. The same full departure cleanup is used whether a member is discovered by an authenticated request, the scheduled sweep, or either Halloween collector. Cleanup revokes administrator access first, then invalidates all sessions, removes the saved faction login key and Halloween contribution data, clears the stale faction-directory entry, and removes company-sharing relationships. Torn outages, rate limits, and key-validation failures are not treated as proof that someone has left.

Never submit another player's key, Torn password, session token, or other authentication material. API keys must only be used for data the member is authorized to access.

## Backend and deployment

The production API Worker is now `naughtyfamily-api` at `https://naughtyfamily-api.kboone801.workers.dev`, using the existing `naughty-company-dashboard` D1 database. The synchronized portal branch carries migrations through `0031_torn_event_calendar_windows.sql`; production has not yet applied the portal migration chain.

Production Worker deployment is manual-only on the PR branch and requires the confirmed `naughty-company-api` target plus an operator-supplied reference to an externally stored, verified D1 backup. The workflow does not create or validate the backup. The legacy Pages rollback site's automatic deployments are disabled, and the new `naughtyfamily` target remains paused. Do not run production migrations, deploy the Worker, or publish Pages until the backup, migration, admin/non-admin, rollback and cutover gates in [the production cutover review](docs/PRODUCTION-CUTOVER-REVIEW.md) are completed and explicitly approved.
