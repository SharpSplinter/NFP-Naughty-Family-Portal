import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const [worker, migration, floor, workspace] = await Promise.all([
  readFile(new URL("../src/worker/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../migrations/auth/0032_portal_first_login_consent.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/components/floor/floor-app.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/portal/workspaces.tsx", import.meta.url), "utf8"),
])

assert.match(migration, /CREATE TABLE IF NOT EXISTS portal_user_consents/)
assert.match(migration, /policy_acknowledged_at TEXT NOT NULL/)
assert.match(migration, /historical_collection_enabled INTEGER NOT NULL DEFAULT 0/)
assert.match(migration, /share_halloween_history INTEGER NOT NULL DEFAULT 0/, "Halloween sharing is a separate opt-in and defaults off")
assert.match(migration, /share_private_live INTEGER NOT NULL DEFAULT 0/)
assert.ok(worker.includes("share_halloween_history AS shareHalloweenHistory"), "member preferences expose separate Halloween sharing")
assert.ok(worker.includes("const shareHalloweenHistory = historicalCollectionEnabled && body.shareHalloweenHistory === true"), "Halloween sharing must be separately and explicitly selected")
assert.ok(worker.includes("COALESCE(pc.share_halloween_history, 0) = 1 OR p.player_id = ?"), "faction Halloween views must show only self or members who opted to share")
assert.ok(worker.includes("bind(yearValue, yearValue, yearValue, yearValue, yearValue, yearValue, yearValue, yearValue, NAUGHTY_SOULS_FACTION_ID, session.player_id)"), "one-year Halloween archive query must bind all event-year and visibility parameters")
assert.ok(worker.includes("This member has not opted to share their Halloween event history with the faction."), "member detail views must protect non-sharing members")
assert.ok(workspace.includes("Share my Halloween event history and derived metrics with Naughty Souls."), "onboarding must provide a separate Halloween-sharing toggle")
assert.match(migration, /share_networth INTEGER NOT NULL DEFAULT 0/)

assert.ok(worker.includes('url.pathname === "/api/me/portal-consent" && request.method === "GET"'))
assert.ok(worker.includes('url.pathname === "/api/me/portal-consent" && request.method === "POST"'))
assert.ok(worker.includes('consent_version AS consentVersion'))
assert.ok(worker.includes('const PORTAL_CONSENT_VERSION = "portal-data-policy-v2"'), "gym-training history changes require a new central consent version")
assert.ok(worker.includes('const PORTAL_POLICY_VERSION = "2026-11-14-v2"'))
assert.ok(workspace.includes('consentVersion: "portal-data-policy-v2"'), "the setup page must submit the updated central policy version")
assert.ok(workspace.includes("setHistoricalCollectionEnabled(consent.historicalCollectionEnabled === true)") && workspace.includes("setShareHalloweenHistory(consent.shareHalloweenHistory === true)") && workspace.includes("setSharePrivateLive(consent.sharePrivateLive === true)") && workspace.includes("setShareNetworth(consent.shareNetworth === true)"), "policy upgrades must prefill existing optional choices")
assert.ok(workspace.includes("setPolicyAccepted(props.isEdit === true)"), "existing members upgrading a policy version must re-acknowledge the revised notice")
assert.ok(workspace.includes("disabled={!policyAccepted || busy || !preferencesLoaded}"), "setup must not submit until existing preferences have loaded")
assert.ok(worker.includes('setupRequired: portalConsent?.consentVersion !== PORTAL_CONSENT_VERSION'), "sign-in and session restoration must report incomplete central setup")
assert.ok(worker.includes('required: consent?.consentVersion !== PORTAL_CONSENT_VERSION'), "the preference endpoint must report whether central setup is required")
assert.ok(worker.includes('428, origin'), "member API requests must be gated until initial setup is complete")
assert.ok(worker.includes("function workerServiceTornApiKey(env: WorkerEnv): string"), "shared market and faction data must have a strict service-secret credential helper")
assert.ok(worker.includes("return env.TORN_API_KEY_SERVICE?.trim() || \"\""), "the shared-data key helper must use only TORN_API_KEY_SERVICE")
assert.ok(worker.includes("const apiKey = workerServiceTornApiKey(env)"), "faction collectors and market lookups must use the strict Worker service key")
assert.ok(worker.includes("async function refreshFactionDirectoryFromServiceKey"), "scheduled faction-directory refreshes must use the Worker service key")
assert.doesNotMatch(worker, /refreshFactionDirectoryFromAnyKey|SELECT player_id, ciphertext, iv FROM api_keys ORDER BY updated_at DESC LIMIT 1/, "shared faction refreshes must never borrow a saved member key")
assert.ok(worker.includes('const serviceKey = workerServiceTornApiKey(env)'), "member-triggered faction-directory refresh must use the Worker service key")
assert.ok(worker.includes("https://api.torn.com/v2/market/"), "market requests are made by the Worker")
assert.ok(worker.includes('url.pathname === "/api/me/private-live/refresh" && request.method === "POST"'), "private-live refresh must remain supported")
assert.ok(worker.includes('Number(centralPreferences?.sharePrivateLive) !== 1'), "private-live refresh must re-check the central sharing toggle")
assert.doesNotMatch(worker, /body\.consent === true|body\.shareWithFaction === true|consentVersion !== "halloween-history-v2"|consentVersion !== "christmas-town-history-v1"/, "member collection and sharing routes must not require duplicate feature-level consent")
assert.ok(worker.includes('UPDATE member_private_live_keys SET include_networth = ?, updated_at = ? WHERE player_id = ?'), "changing central networth preference must update an existing private-live connection")
assert.ok(worker.includes("Historical collection is disabled in the member's central portal preferences"), "disabling historical collection must stop pending event jobs")

assert.ok(worker.includes("serviceFullAccessApiKey(env)"), "other Worker-owned ranking tasks may retain their Worker-only compatibility fallback")
assert.doesNotMatch(worker, /env\.TORN_FACTION_API_KEY\?\.trim\(\)/)
assert.doesNotMatch(worker, /SELECT player_id FROM api_keys ORDER BY updated_at DESC LIMIT 1/)

assert.ok(floor.includes("PortalSetupWorkspace"))
const customKeyUrl = "https://www.torn.com/preferences.php?utm_source=chatgpt.com#tab=api?step=addNewKey&user=faction,job,personalstats,profile,bars,calendar,cooldowns,gym,halloween,perks,refills,attacks,networth,log&company=companies,employees,profile,stock&faction=members,stats,contributors&torn=companies,gyms,items,logcategories,logtypes&sensitiveData=1&title=NaughtyFamily"
assert.ok(floor.includes(`href="${customKeyUrl}"`), "the login key builder must preserve the supplied Torn URL exactly")
assert.ok(floor.includes("setupToken"))
assert.ok(workspace.includes("export function PortalSetupWorkspace"))
assert.ok(workspace.includes("/api/me/portal-consent"))
assert.ok(workspace.includes("/api/me/halloween/collect"))
assert.ok(workspace.includes("/api/me/christmas-town/collect"))
assert.ok(workspace.includes("/api/me/private-live/key"))
assert.ok(workspace.includes("/api/auth/company-key"))

console.log("PASS portal first-login consent gate, versioned preferences, automatic eligible history backfills, shared Worker credential routing, and onboarding UI")
