import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const [worker, halloweenUi, christmasUi, migration] = await Promise.all([
  readFile(new URL("../src/worker/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/portal/workspaces.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/portal/christmas-town.tsx", import.meta.url), "utf8"),
  readFile(new URL("../migrations/auth/0031_torn_event_calendar_windows.sql", import.meta.url), "utf8"),
])

assert.ok(migration.includes("ALTER TABLE halloween_event_windows"))
assert.ok(migration.includes("requires_time_confirmation INTEGER NOT NULL DEFAULT 1"))
assert.ok(migration.includes("calendar_source TEXT NOT NULL DEFAULT 'historical_known'"))
assert.ok(migration.includes("source TEXT NOT NULL DEFAULT 'user_confirmed'"))
assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS torn_event_calendar_cache"))
assert.ok(worker.includes("https://api.torn.com/v2/torn/calendar"))
assert.ok(worker.includes("https://api.torn.com/v2/user/calendar"))
assert.ok(worker.includes('Authorization: "ApiKey " + apiKey'))
assert.ok(worker.includes("personal_start_minute_of_day AS personalStartMinuteOfDay"))
assert.ok(worker.includes("earliestStartAt") && worker.includes("latestEndAt"))
assert.ok(worker.includes("Date.now() - 6 * 60 * 60 * 1000"), "Torn's calendar response must be cached to avoid repeated requests")
assert.ok(worker.includes("buildTornCalendarEventWindow"), "calendar nominal and personal windows must be resolved separately")
assert.ok(worker.includes("calendar_source = 'torn_calendar'"), "current-year future Halloween windows must be marked as API-derived")
assert.ok(worker.includes("'historical_fallback'"), "unknown historical years must use an explicit broad-window source")
assert.ok(worker.includes("year + \"-10-25T00:00:00.000Z\"") && worker.includes("year + \"-11-01T23:59:59.000Z\""))

const recordedWindowsStart = worker.indexOf("async function loadRecordedHalloweenEventWindows")
const recordedWindowsEnd = worker.indexOf("async function loadHalloweenAllTimeArchive", recordedWindowsStart)
const recordedWindowsLoader = worker.slice(recordedWindowsStart, recordedWindowsEnd)
assert.ok(recordedWindowsStart >= 0 && recordedWindowsEnd > recordedWindowsStart)
assert.doesNotMatch(recordedWindowsLoader, /\b(?:INSERT|UPDATE|DELETE|REPLACE)\b|\.run\(|\.batch\(/i,
  "Historical event-window reads must not write or seed D1 rows.")
assert.match(recordedWindowsLoader, /historical_collection_enabled AS historicalCollectionEnabled/)
assert.match(recordedWindowsLoader, /existingYears\.has\(year\)/,
  "Only genuinely missing prior seasons should receive an in-memory fallback.")
assert.match(recordedWindowsLoader, /windows\.set\(year, \{/)

assert.match(worker, /FACTION_WEEKLY_RETRY_INTERVAL_MS = 15 \* 60 \* 1000/)
assert.match(worker, /FACTION_WEEKLY_RETRY_TICK_INTERVAL/)
const fiveMinuteDispatcherStart = worker.indexOf("async function runFiveMinuteScheduledJobs")
const fiveMinuteDispatcherEnd = worker.indexOf("export default {", fiveMinuteDispatcherStart)
const fiveMinuteDispatcher = worker.slice(fiveMinuteDispatcherStart, fiveMinuteDispatcherEnd)
assert.match(fiveMinuteDispatcher, /schedulerBucket % FACTION_WEEKLY_RETRY_TICK_INTERVAL === 0/,
  "Weekly boundary/report polling must be rate-limited to the 15-minute cadence.")
assert.match(fiveMinuteDispatcher, /enqueueScheduledHalloweenSnapshots\(env, scheduledTime\)/,
  "Halloween event-window timing must retain the five-minute dispatcher.")

const halloweenSchedulerStart = worker.indexOf("async function enqueueScheduledHalloweenSnapshots")
const halloweenSchedulerEnd = worker.indexOf("async function markAdminFactionDirectoryRefreshFailed", halloweenSchedulerStart)
const halloweenScheduler = worker.slice(halloweenSchedulerStart, halloweenSchedulerEnd)
assert.equal((halloweenScheduler.match(/db\.prepare\(/g) || []).length, 1,
  "The five-minute Halloween eligibility scan must use one set-based D1 SELECT, not per-member SELECTs.")
assert.match(halloweenScheduler, /WITH params AS[\s\S]*member_windows AS[\s\S]*member_buckets AS[\s\S]*member_state AS[\s\S]*scheduled_candidates AS/,
  "Halloween scheduler eligibility must be computed set-wise in SQL.")
assert.match(halloweenScheduler, /opening\.event_year = b\.event_year AND opening\.player_id = b\.player_id/)
assert.match(halloweenScheduler, /periodic\.event_year = b\.event_year AND periodic\.player_id = b\.player_id/)
assert.match(halloweenScheduler, /closing\.event_year = b\.event_year AND closing\.player_id = b\.player_id/)
assert.doesNotMatch(halloweenScheduler, /for \(const member of members\.results/)

const halloweenEnqueueStart = worker.indexOf("async function enqueueHalloweenLiveSnapshot")
const halloweenEnqueueEnd = worker.indexOf("async function enqueueScheduledHalloweenSnapshots", halloweenEnqueueStart)
const halloweenEnqueue = worker.slice(halloweenEnqueueStart, halloweenEnqueueEnd)
assert.match(halloweenEnqueue, /INSERT OR IGNORE INTO halloween_live_snapshot_jobs/,
  "Unique event/member/kind/bucket keys must provide atomic idempotency without a preflight SELECT.")
assert.match(halloweenEnqueue, /inserted\.meta\?\.changes/)
assert.match(halloweenEnqueue, /DELETE FROM halloween_live_snapshot_jobs WHERE job_id = \? AND status = 'queued'/,
  "A failed Queue send must remove its unsent queued row so the next scheduler sweep can retry.")
assert.ok(worker.includes("requiresConfirmation: true"))
assert.ok(worker.includes("source: slot.source"))
assert.ok(worker.includes("source = 'user_confirmed'"), "manual historical confirmations must remain distinct from API-derived slots")
assert.ok(worker.includes("source) VALUES (?, ?, ?, ?, ?, 'torn_api')"), "future personal calendar times must be marked as Torn-derived")
assert.ok(worker.includes("await ensureHalloweenEventDefinition(env, session.player_id, yearValue)"))
assert.ok(worker.includes('url.pathname === "/api/me/christmas-town/calendar"'))
assert.ok(worker.includes('loadTornCalendarActivity(env, session.player_id, "christmas-town", "Christmas town")'))
assert.ok(christmasUi.includes("/api/me/christmas-town/calendar"))
assert.ok(christmasUi.includes("calendarEndAt"), "the current Christmas Town year must not become selectable before the calendar start")
assert.ok(christmasUi.includes("calendarEvent?.eventYear === year"), "the current Christmas Town season must compare against its exact API window")
assert.ok(worker.includes('status: "upcoming"') && worker.includes("Date.parse(currentChristmasWindow.endAt) > nowMs"), "Christmas Town historical collection must wait for the API-defined season to close")
assert.ok(christmasUi.includes("Date.now() >= Date.parse(calendarEndAt as string)"), "the current season should only become selectable after its confirmed end")
assert.ok(halloweenUi.includes("personalWindow?.requiresConfirmation"), "only known historical years should show the per-year time confirmation control")
assert.ok(halloweenUi.includes("complete nominal event window"), "unknown years must explain their full-window fallback")

console.log("PASS Torn event calendar windows: current-year API sync, historical confirmation, and unknown-year fallback")
