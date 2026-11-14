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
assert.ok(worker.includes("requiresConfirmation: true"))
assert.ok(worker.includes("source: slot.source"))
assert.ok(worker.includes("source = 'user_confirmed'"), "manual historical confirmations must remain distinct from API-derived slots")
assert.ok(worker.includes("source) VALUES (?, ?, ?, ?, ?, 'torn_api')"), "future personal calendar times must be marked as Torn-derived")
assert.ok(worker.includes("await ensureHalloweenEventDefinition(env, session.player_id, yearValue)"))
assert.ok(worker.includes('url.pathname === "/api/me/christmas-town/calendar"'))
assert.ok(worker.includes('loadTornCalendarActivity(env, session.player_id, "christmas-town", "Christmas town")'))
assert.ok(christmasUi.includes("/api/me/christmas-town/calendar"))
assert.ok(christmasUi.includes("calendarStartAt"), "the current Christmas Town year must not become selectable before the calendar start")
assert.ok(christmasUi.includes("calendarEvent?.eventYear === year"), "the current Christmas Town season must compare against its exact API window")
assert.ok(halloweenUi.includes("personalWindow?.requiresConfirmation"), "only known historical years should show the per-year time confirmation control")
assert.ok(halloweenUi.includes("complete nominal event window"), "unknown years must explain their full-window fallback")

console.log("PASS Torn event calendar windows: current-year API sync, historical confirmation, and unknown-year fallback")
