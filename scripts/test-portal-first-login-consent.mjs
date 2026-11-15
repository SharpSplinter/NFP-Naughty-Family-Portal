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
assert.match(migration, /share_private_live INTEGER NOT NULL DEFAULT 0/)
assert.match(migration, /share_networth INTEGER NOT NULL DEFAULT 0/)

assert.ok(worker.includes('url.pathname === "/api/me/portal-consent" && request.method === "GET"'))
assert.ok(worker.includes('url.pathname === "/api/me/portal-consent" && request.method === "POST"'))
assert.ok(worker.includes('consent_version AS consentVersion'))
assert.ok(worker.includes('setupRequired: portalConsent?.consentVersion !== PORTAL_CONSENT_VERSION'), "sign-in and session restoration must report incomplete central setup")
assert.ok(worker.includes('required: consent?.consentVersion !== PORTAL_CONSENT_VERSION'), "the preference endpoint must report whether central setup is required")
assert.ok(worker.includes('428, origin'), "member API requests must be gated until initial setup is complete")
assert.ok(worker.includes("serviceFullAccessApiKey(env)"), "shared faction and market work must use the Worker service key")
assert.doesNotMatch(worker, /env\.TORN_FACTION_API_KEY\?\.trim\(\)/)
assert.doesNotMatch(worker, /SELECT player_id FROM api_keys ORDER BY updated_at DESC LIMIT 1/)

assert.ok(floor.includes("PortalSetupWorkspace"))
assert.ok(floor.includes("sensitiveData=1&title=NaughtyFamily"))
assert.ok(floor.includes("setupToken"))
assert.ok(workspace.includes("export function PortalSetupWorkspace"))
assert.ok(workspace.includes("/api/me/portal-consent"))
assert.ok(workspace.includes("/api/me/halloween/collect"))
assert.ok(workspace.includes("/api/me/christmas-town/collect"))
assert.ok(workspace.includes("/api/me/private-live/key"))
assert.ok(workspace.includes("/api/auth/company-key"))

console.log("PASS portal first-login consent gate, versioned preferences, automatic eligible history backfills, shared Worker credential routing, and onboarding UI")
