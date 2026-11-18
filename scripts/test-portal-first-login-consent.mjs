import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const [worker, migration, keyConsentMigration, keyAccessTypeMigration, visibilityMigration, floor, workspace] = await Promise.all([
  readFile(new URL("../src/worker/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../migrations/auth/0032_portal_first_login_consent.sql", import.meta.url), "utf8"),
  readFile(new URL("../migrations/auth/0034_portal_api_key_usage_consent.sql", import.meta.url), "utf8"),
  readFile(new URL("../migrations/auth/0035_portal_api_key_access_type.sql", import.meta.url), "utf8"),
  readFile(new URL("../migrations/auth/0037_private_data_visibility.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/components/floor/floor-app.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/portal/workspaces.tsx", import.meta.url), "utf8"),
])

assert.match(migration, /CREATE TABLE IF NOT EXISTS portal_user_consents/)
assert.match(migration, /policy_acknowledged_at TEXT NOT NULL/)
assert.match(migration, /historical_collection_enabled INTEGER NOT NULL DEFAULT 0/)
assert.match(migration, /share_private_live INTEGER NOT NULL DEFAULT 0/)
assert.match(keyConsentMigration, /api_key_usage_accepted INTEGER NOT NULL DEFAULT 0/)
assert.match(keyConsentMigration, /api_key_consent_fingerprint TEXT/)
assert.match(keyAccessTypeMigration, /api_key_access_type TEXT/)
assert.match(keyAccessTypeMigration, /'custom', 'full'/)
assert.match(visibilityMigration, /private_data_visibility TEXT NOT NULL DEFAULT 'self'/)
assert.match(visibilityMigration, /'self', 'faction_access', 'faction_members'/)
assert.match(visibilityMigration, /CREATE TABLE IF NOT EXISTS portal_member_key_capabilities/)
assert.match(visibilityMigration, /key_fingerprint TEXT NOT NULL/)
assert.match(visibilityMigration, /faction_access INTEGER NOT NULL DEFAULT 0/)

assert.ok(worker.includes('url.pathname === "/api/me/portal-consent" && request.method === "GET"'))
assert.ok(worker.includes('url.pathname === "/api/me/portal-consent" && request.method === "POST"'))
assert.ok(worker.includes('const PORTAL_CONSENT_VERSION = "portal-data-policy-v4"'))
assert.ok(worker.includes('const PORTAL_POLICY_VERSION = "2026-11-15-v2"'))
assert.ok(workspace.includes('consentVersion: "portal-data-policy-v4"'))
assert.ok(worker.includes("const historicalCollectionEnabled = true"), "history collection must activate automatically after policy/key consent")
assert.ok(worker.includes("normalizePrivateDataVisibility(body.privateDataVisibility)"), "the server must normalize the one central visibility selector")
assert.ok(worker.includes("private_data_visibility = excluded.private_data_visibility"), "the visibility choice must persist centrally")
assert.ok(worker.includes("async function memberHasFactionApiAccess"), "restricted visibility must use the viewer's saved Torn key permissions")
assert.ok(worker.includes('https://api.torn.com/v2/key/info'), "faction access must come from Torn key info")
assert.ok(worker.includes("root?.faction === true") || worker.includes("access?.faction === true"), "faction permission is an explicit key-info capability")
assert.ok(worker.includes("portal_member_key_capabilities"), "key-info capability checks must be cached")
assert.ok(worker.includes("key_fingerprint"), "cached capability must be bound to the current saved key")
assert.ok(worker.includes("privateDataVisibilityAllows"), "member detail routes must enforce private-data visibility")
assert.ok(worker.includes('COALESCE(pc.private_data_visibility, \'self\')'), "faction data queries must fail closed to Self when no visibility record exists")
assert.ok(worker.includes('visibility === "faction_members"'), "All Members visibility must be honored")
assert.ok(worker.includes('visibility === "faction_access" && viewerHasFactionAccess'), "Faction-access visibility must require confirmed viewer key capability")
assert.ok(worker.includes("DELETE FROM portal_member_key_capabilities WHERE player_id = ?"), "key replacement must invalidate cached access privileges")

assert.ok(workspace.includes('setPrivateDataVisibility(consent.privateDataVisibility'))
assert.ok(workspace.includes('value="self"'))
assert.ok(workspace.includes('value="faction_access"'))
assert.ok(workspace.includes('value="faction_members"'))
assert.ok(workspace.includes("Self only · Default"))
assert.ok(workspace.includes("Faction Leaders / Staff / Council"))
assert.ok(workspace.includes("All Naughty Souls members"))
assert.ok(workspace.includes('faction: true'))
assert.ok(workspace.includes("Automatic after setup · No additional collection opt-in"))
assert.ok(!workspace.includes("Allow historical collection for supported portal features."), "the separate history opt-in must be removed")
assert.ok(workspace.includes("shareNetworth: privateDataVisibility !== \"self\" && shareNetworth"), "detailed networth remains a separate optional permission")

assert.ok(workspace.includes("setPolicyAccepted(!policyRequired)"), "the setup form must follow the server's policy acknowledgement requirement")
assert.ok(workspace.includes("disabled={!policyAcknowledgementRequired || busy || saved}"), "members must explicitly acknowledge policy updates")
assert.ok(workspace.includes("apiKeyUsageAccepted: true"), "the setup form must persist explicit primary API-key authorization")
assert.ok(workspace.includes('value="custom"'), "the setup form must let a member select Custom Access")
assert.ok(workspace.includes('value="full"'), "the setup form must let a member select Full Access")
assert.ok(worker.includes('body.apiKeyAccessType !== "custom" && body.apiKeyAccessType !== "full"'))
assert.ok(worker.includes("api_key_access_type AS apiKeyAccessType"))
assert.ok(worker.includes("api_key_consent_fingerprint AS apiKeyConsentFingerprint"))
assert.ok(worker.includes("portalConsentIsCurrent"))
assert.ok(worker.includes("428, origin"), "member API requests must be gated until initial setup is complete")
assert.ok(floor.includes("portalSetupIsRequired"))
assert.ok(floor.includes("setSetupToken(payload.token)"))
assert.ok(floor.includes("setSetupToken(token)"))
assert.ok(floor.includes('placeholder="Input Custom or Full Access API Key"'))

assert.ok(worker.includes("function workerServiceTornApiKey(env: WorkerEnv): string"))
assert.ok(worker.includes('return env.TORN_API_KEY_SERVICE?.trim() || ""'))
assert.ok(worker.includes("const apiKey = workerServiceTornApiKey(env)"))
assert.ok(worker.includes("async function refreshFactionDirectoryFromServiceKey"))
assert.doesNotMatch(worker, /refreshFactionDirectoryFromAnyKey|SELECT player_id, ciphertext, iv FROM api_keys ORDER BY updated_at DESC LIMIT 1/)
assert.ok(worker.includes('const serviceKey = workerServiceTornApiKey(env)'))
assert.ok(worker.includes("https://api.torn.com/v2/market/"))
assert.ok(worker.includes('url.pathname === "/api/me/private-live/refresh" && request.method === "POST"'))
assert.ok(worker.includes('normalizePrivateDataVisibility(centralPreferences?.privateDataVisibility) === "self"'))
assert.ok(worker.includes('UPDATE member_private_live_keys SET include_networth = ?, updated_at = ? WHERE player_id = ?'))
assert.ok(worker.includes("serviceFullAccessApiKey(env)"))
assert.doesNotMatch(worker, /env\.TORN_FACTION_API_KEY\?\.trim\(\)/)
assert.doesNotMatch(worker, /SELECT player_id FROM api_keys ORDER BY updated_at DESC LIMIT 1/)

assert.ok(floor.includes("PortalSetupWorkspace"))
const customKeyUrl = "https://www.torn.com/preferences.php?utm_source=chatgpt.com#tab=api?step=addNewKey&user=faction,job,personalstats,profile,bars,calendar,cooldowns,gym,halloween,perks,refills,attacks,networth,log,battlestats,jobpoints&company=companies,employees,profile,stock&faction=members,stats,contributors&torn=companies,gyms,items,logcategories,logtypes,stats&market=itemmarket&sensitiveData=1&title=NaughtyFamily"
assert.ok(floor.includes(`href="${customKeyUrl}"`), "the login key builder must preserve the supplied Torn URL exactly")
assert.ok(floor.includes("setupToken"))
assert.ok(workspace.includes("export function PortalSetupWorkspace"))
assert.ok(workspace.includes("/api/me/portal-consent"))
assert.ok(workspace.includes("/api/me/halloween/collect"))
assert.ok(workspace.includes("/api/me/christmas-town/collect"))
assert.ok(workspace.includes("/api/me/private-live/key"))
assert.ok(workspace.includes("/api/auth/company-key"))

console.log("PASS first-login consent, automatic history collection, three-tier private visibility, viewer faction-key authorization, key capability invalidation, and Custom/Full Access onboarding")
