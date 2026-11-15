import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const [worker, migration, workspace] = await Promise.all([
  readFile(new URL("../src/worker/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../migrations/auth/0023_member_private_live_connections.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/components/portal/workspaces.tsx", import.meta.url), "utf8"),
])

assert.match(migration, /CREATE TABLE IF NOT EXISTS member_private_live_keys/)
assert.match(migration, /ciphertext TEXT NOT NULL/)
assert.match(migration, /iv TEXT NOT NULL/)
assert.match(migration, /consent_version TEXT NOT NULL/)
assert.match(migration, /CREATE TABLE IF NOT EXISTS member_private_live_api_throttles/)
assert.match(migration, /CREATE TABLE IF NOT EXISTS faction_member_private_live_snapshots/)
assert.match(migration, /bars_json TEXT NOT NULL/)
assert.match(migration, /cooldowns_json TEXT NOT NULL/)
assert.match(migration, /networth_json TEXT/)
assert.match(migration, /player_id TEXT PRIMARY KEY REFERENCES players\(player_id\) ON DELETE CASCADE/)

assert.ok(worker.includes('url.pathname === "/api/me/private-live/key" && request.method === "GET"'))
assert.ok(worker.includes('url.pathname === "/api/me/private-live/key" && request.method === "POST"'))
assert.ok(worker.includes('url.pathname === "/api/me/private-live/refresh" && request.method === "POST"'))
assert.ok(worker.includes("async function claimPrivateLiveRequest"))
assert.ok((worker.match(/await claimPrivateLiveRequest\(env, session\.player_id\)/g) || []).length >= 2,
  "connect and refresh share one per-member request budget")
assert.ok(worker.includes('url.pathname === "/api/me/private-live/key" && request.method === "DELETE"'))
assert.ok(worker.includes('const apiKey = await savedKey(env, session.player_id) ?? ""'), "private live must reuse the canonical sign-in key")
assert.ok(worker.includes('await validatePrivateLiveKeyOwner(env, apiKey, session.player_id)'), "the canonical portal key must belong to the authenticated session owner")
assert.ok(worker.includes("function privateLiveFetcher(env: WorkerEnv)"))
assert.ok(worker.includes("env.TORN_API_FIXTURE"), "staging private-live routes must use the sanitized fixture Service Binding")
assert.ok(worker.includes('normalizePrivateDataVisibility(centralPreferences?.privateDataVisibility) === "self"'), "private-live authorization must follow central private-data visibility")
assert.ok(worker.includes("Number(centralPreferences?.shareNetworth) === 1"), "detailed networth must be authorized by the separate central preference")
assert.ok(worker.includes('fetchPrivateLiveSelection(env, apiKey, "bars")') && worker.includes('fetchPrivateLiveSelection(env, apiKey, "cooldowns")'))
assert.ok(worker.includes('fetchPrivateLiveSelection(env, apiKey, "networth")') && worker.includes('if (includeNetworth)'), "detailed networth must remain opt-in and use the fixture-aware transport")
assert.ok(worker.includes("let includeNetworth = Number(centralPreferences?.shareNetworth) === 1"), "networth sharing may be gracefully disabled when Torn denies that optional selection")
assert.ok(worker.includes("encryptKey(env, apiKey)"), "the owner key must be encrypted before persistence")
assert.ok(worker.includes('DELETE FROM faction_member_private_live_snapshots WHERE player_id = ?'))
assert.ok(worker.includes('DELETE FROM member_private_live_keys WHERE player_id = ?'))
assert.ok(worker.includes("await purgeHalloweenMemberData(env, playerId)"), "private live lifecycle must remain separate from Halloween cleanup")
assert.ok(worker.includes("await db.prepare(\"DELETE FROM member_private_live_keys WHERE player_id = ?\")"), "faction departure must purge the private live key")
assert.ok(worker.includes("k.share_with_faction = 1"), "only members who opted into faction sharing may be returned")
assert.ok(worker.includes("st.disabled_at IS NULL"), "disabled accounts must not expose their private live snapshots")

assert.ok(workspace.includes('request("/api/me/private-live/key", "POST")'), "the setup flow must connect using saved central preferences without a second feature consent payload")
assert.ok(workspace.includes("privateDataVisibility,"), "central setup must submit the single private-data visibility setting")
assert.ok(workspace.includes("I have read and acknowledge the current Naughty Family data policy and privacy notice."), "the central setup page must capture the required policy acknowledgement")
assert.ok(workspace.includes("Also share my detailed networth breakdown."), "detailed networth remains a separate opt-in")
assert.ok(workspace.includes("No secondary company key is required to finish setup."))
assert.doesNotMatch(workspace, /settings-private-live-key|privateLiveKey\.trim\(\)/)
assert.ok(workspace.includes("Disconnect & delete snapshot"))
assert.ok(workspace.includes("Your API key is not shared."))
assert.ok(workspace.includes("Only the latest bars, cooldowns and optionally networth snapshot are retained"))

assert.ok(!workspace.includes("I consent to encrypted storage of my own key"), "private-live setup must not ask for a second feature-specific consent")
assert.doesNotMatch(worker, /body\.shareWithFaction === true|consentVersion !== "faction-private-live-v1"/, "private-live routes must not require a second feature-level consent")
console.log("PASS private live key owner validation, centralized faction-sharing opt-in, separate optional networth choice, encrypted storage, revocation, and departure cleanup contract")
