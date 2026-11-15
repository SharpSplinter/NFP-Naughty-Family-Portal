import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CONFIG = "wrangler.acceptance.toml";
const DATABASE = "naughtyfamily-acceptance-staging";
const DATABASE_ID = "02cca699-1232-495f-8a0a-de525058b92a";
const ACCOUNT_ID = "6c03b978ed9a59adc3f61c715bdad45c";
const COMPANY_ID = "999999003";
const COMPANY_TYPE = "Adult Novelties";
const MEMBERS = [
  { id: "999999001", name: "Staging Private History Member", companyName: "Staging Private History Company", adBudget: 50000, wages: 100000, orderQuantity: 5, unitCost: 250, stockBase: 10000, stockStep: 100, incomeBase: 13500000, incomeStep: 125000 },
  { id: "999999002", name: "Staging Private History Other Member", companyName: "Other Member Private History Company", adBudget: 120000, wages: 230000, orderQuantity: 7, unitCost: 450, stockBase: 20000, stockStep: 250, incomeBase: 987650000, incomeStep: 250000 },
];
const ADMIN = { id: "999999004", name: "Staging Private History Admin" };
const CONSENT_MEMBER = { id: "999999007", name: "Staging First Login Consent Member" };

function sqlQuote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}
function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function syntheticPrimaryKey(playerId) {
  const ciphertext = "staging-consent-envelope-" + playerId;
  const iv = "staging-consent-iv-" + playerId;
  return {
    ciphertext,
    iv,
    lastFour: String(playerId).slice(-4),
    fingerprint: sha256(String(playerId) + ":" + ciphertext + ":" + iv),
  };
}
function profileFor(member, dailyIncome) {
  return {
    profile: {
      id: Number(COMPANY_ID),
      name: member.companyName,
      type: { id: 1, name: COMPANY_TYPE },
      rating: member.id === MEMBERS[0].id ? 8.5 : 7.2,
      days_old: 365,
      director: { id: Number(member.id), name: member.name },
      employees: { hired: 1, capacity: 10 },
      income: { daily: dailyIncome, weekly: dailyIncome * 7 },
      profit: { daily: dailyIncome - member.adBudget - member.wages - member.orderQuantity * member.unitCost },
      advertising_budget: member.adBudget,
    },
  };
}
function employeesFor(member) {
  return {
    employees: [{
      id: Number(member.id) + 100,
      name: "Synthetic History Employee",
      position: { id: 1, name: "Human Resources" },
      days_in_company: 365,
      stats: { manual_labor: 250, intelligence: 250, endurance: 250 },
      wage: member.wages,
      effectiveness: { total: 100, working_stats: 100, inactivity: 100, addiction: 100 },
      status: { description: "Active" },
      last_action: { relative: "Recently" },
    }],
  };
}
function stockFor(member, index) {
  return [{
    name: "Synthetic History Stock",
    in_stock: member.stockBase + index * member.stockStep,
    on_order: member.orderQuantity,
    cost: member.unitCost,
  }];
}

assert.ok(process.env.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN is required.");
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT_ID, "Refusing to seed outside the reviewed Cloudflare account.");
assert.ok(process.env.GITHUB_ENV, "GITHUB_ENV is required so the ephemeral sessions reach the Playwright step.");
const config = readFileSync(CONFIG, "utf8");
assert.match(config, /name\s*=\s*"naughtyfamily-api-staging"/);
assert.match(config, /database_name\s*=\s*"naughtyfamily-acceptance-staging"/);
assert.ok(config.includes('database_id = "' + DATABASE_ID + '"'), "Refusing to seed a different D1 database.");
assert.ok(!config.includes("bbbe128a-c5cc-46ec-b8ef-93860183e795"), "Production D1 must not appear in the acceptance config.");

const now = new Date();
const nowIso = now.toISOString();
const expiresAt = Math.floor(now.getTime() / 1000) + 3600;
const tokens = MEMBERS.map(() => randomBytes(32).toString("hex"));
const adminToken = randomBytes(32).toString("hex");
const consentToken = randomBytes(32).toString("hex");
const tokenHashes = tokens.map(sha256);
const adminTokenHash = sha256(adminToken);
const consentTokenHash = sha256(consentToken);
const FEATURE_MEMBER = { id: "999999005", name: "Staging Feature Walkthrough Member" };
const PARTIAL_MEMBER = { id: "999999006", name: "Staging Partial Archive Member" };
const featureToken = randomBytes(32).toString("hex");
const featureTokenHash = sha256(featureToken);
const featurePlayerId = FEATURE_MEMBER.id;
const featureDiscordUserId = "999999999999999999";
const incomeSeries = MEMBERS.map(member => Array.from({ length: 7 }, (_, index) => member.incomeBase + index * member.incomeStep));

const statements = [
  "PRAGMA foreign_keys = ON;",
  // Only previously created fixture identities are removed. A colliding real member ID is never deleted.
  "DELETE FROM admin_audit_log WHERE actor_player_id IN (" + [MEMBERS[0].id, MEMBERS[1].id, ADMIN.id, CONSENT_MEMBER.id].map(sqlQuote).join(", ") + ");",
  "DELETE FROM api_keys WHERE player_id IN (SELECT player_id FROM players WHERE (player_id = " + sqlQuote(MEMBERS[0].id) + " AND player_name = " + sqlQuote(MEMBERS[0].name) + ") OR (player_id = " + sqlQuote(MEMBERS[1].id) + " AND player_name = " + sqlQuote(MEMBERS[1].name) + ") OR (player_id = " + sqlQuote(ADMIN.id) + " AND player_name = " + sqlQuote(ADMIN.name) + ") OR (player_id = " + sqlQuote(CONSENT_MEMBER.id) + " AND player_name = " + sqlQuote(CONSENT_MEMBER.name) + "));",
  "DELETE FROM players WHERE (player_id = " + sqlQuote(MEMBERS[0].id) + " AND player_name = " + sqlQuote(MEMBERS[0].name) + ") OR (player_id = " + sqlQuote(MEMBERS[1].id) + " AND player_name = " + sqlQuote(MEMBERS[1].name) + ") OR (player_id = " + sqlQuote(ADMIN.id) + " AND player_name = " + sqlQuote(ADMIN.name) + ") OR (player_id = " + sqlQuote(CONSENT_MEMBER.id) + " AND player_name = " + sqlQuote(CONSENT_MEMBER.name) + ");",
];
for (let index = 0; index < MEMBERS.length; index += 1) {
  const member = MEMBERS[index];
  statements.push(
    "INSERT INTO players (player_id, player_name, created_at, updated_at, faction_id, faction_verified_at) VALUES (" +
    [member.id, member.name, nowIso, nowIso, "8317", nowIso].map(sqlQuote).join(", ") + ");"
  );
  const primaryKey = syntheticPrimaryKey(member.id);
  statements.push(
    "INSERT INTO api_keys (player_id, ciphertext, iv, last_four, created_at, updated_at) VALUES (" +
    [member.id, primaryKey.ciphertext, primaryKey.iv, primaryKey.lastFour, nowIso, nowIso].map(sqlQuote).join(", ") + ");"
  );
  statements.push(
    "INSERT INTO portal_user_consents (player_id, consent_version, policy_version, policy_acknowledged_at, api_key_usage_accepted, api_key_access_type, api_key_consent_acknowledged_at, api_key_consent_fingerprint, historical_collection_enabled, share_halloween_history, share_private_live, share_networth, created_at, updated_at) VALUES (" +
    [member.id, "portal-data-policy-v3", "2026-11-15-v1", nowIso, 1, "custom", nowIso, primaryKey.fingerprint, 0, 0, 0, 0, nowIso, nowIso].map(sqlQuote).join(", ") + ");"
  );
  statements.push(
    "INSERT INTO sessions (token_hash, player_id, expires_at, created_at) VALUES (" +
    [tokenHashes[index], member.id, expiresAt, nowIso].map(sqlQuote).join(", ") + ");"
  );

  let latestProfile = null;
  let latestEmployees = null;
  let latestFetchedAt = null;
  for (let pointIndex = 0; pointIndex < 7; pointIndex += 1) {
    // Seven consecutive reporting dates, ending yesterday, with the official 18:00 UTC boundary.
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7 + pointIndex, 18, 10, 0, 0));
    const fetchedAt = day.toISOString();
    const profile = profileFor(member, incomeSeries[index][pointIndex]);
    const employees = employeesFor(member);
    const stock = stockFor(member, pointIndex);
    const profileJson = JSON.stringify(profile);
    const employeesJson = JSON.stringify(employees);
    const stockJson = JSON.stringify(stock);
    latestProfile = profileJson;
    latestEmployees = employeesJson;
    latestFetchedAt = fetchedAt;

    statements.push(
      "INSERT INTO company_snapshots (player_id, company_id, profile_json, employees_json, fetched_at) VALUES (" +
      [member.id, COMPANY_ID, profileJson, employeesJson, fetchedAt].map(sqlQuote).join(", ") + ");"
    );
    statements.push(
      "INSERT INTO company_financial_snapshots (player_id, company_id, stock_json, fetched_at) VALUES (" +
      [member.id, COMPANY_ID, stockJson, fetchedAt].map(sqlQuote).join(", ") + ");"
    );
  }
  statements.push(
    "INSERT INTO companies (player_id, company_id, company_name, company_type, profile_json, employees_json, fetched_at) VALUES (" +
    [member.id, COMPANY_ID, member.companyName, COMPANY_TYPE, latestProfile, latestEmployees, latestFetchedAt].map(sqlQuote).join(", ") + ");"
  );
}

statements.push(
  "INSERT INTO players (player_id, player_name, created_at, updated_at, faction_id, faction_verified_at) VALUES (" +
  [ADMIN.id, ADMIN.name, nowIso, nowIso, "8317", nowIso].map(sqlQuote).join(", ") + ");"
);
const adminPrimaryKey = syntheticPrimaryKey(ADMIN.id);
statements.push(
  "INSERT INTO api_keys (player_id, ciphertext, iv, last_four, created_at, updated_at) VALUES (" +
  [ADMIN.id, adminPrimaryKey.ciphertext, adminPrimaryKey.iv, adminPrimaryKey.lastFour, nowIso, nowIso].map(sqlQuote).join(", ") + ");"
);
statements.push(
  "INSERT INTO portal_user_consents (player_id, consent_version, policy_version, policy_acknowledged_at, api_key_usage_accepted, api_key_access_type, api_key_consent_acknowledged_at, api_key_consent_fingerprint, historical_collection_enabled, share_halloween_history, share_private_live, share_networth, created_at, updated_at) VALUES (" +
  [ADMIN.id, "portal-data-policy-v3", "2026-11-15-v1", nowIso, 1, "custom", nowIso, adminPrimaryKey.fingerprint, 0, 0, 0, 0, nowIso, nowIso].map(sqlQuote).join(", ") + ");"
);
statements.push(
  "INSERT INTO sessions (token_hash, player_id, expires_at, created_at) VALUES (" +
  [adminTokenHash, ADMIN.id, expiresAt, nowIso].map(sqlQuote).join(", ") + ");"
);
statements.push(
  "INSERT INTO administrators (player_id, granted_by, granted_at) VALUES (" +
  [ADMIN.id, ADMIN.id, nowIso].map(sqlQuote).join(", ") + ");"
);

// A dedicated unconsented account exercises the real login-to-setup flow.
// Its key fields are synthetic encrypted-envelope metadata, never a Torn key.
const consentFixtureKey = syntheticPrimaryKey(CONSENT_MEMBER.id);
statements.push(
  "INSERT INTO players (player_id, player_name, created_at, updated_at, faction_id, faction_verified_at) VALUES (" +
  [CONSENT_MEMBER.id, CONSENT_MEMBER.name, nowIso, nowIso, "8317", nowIso].map(sqlQuote).join(", ") + ");"
);
statements.push(
  "INSERT INTO api_keys (player_id, ciphertext, iv, last_four, created_at, updated_at) VALUES (" +
  [CONSENT_MEMBER.id, consentFixtureKey.ciphertext, consentFixtureKey.iv, consentFixtureKey.lastFour, nowIso, nowIso].map(sqlQuote).join(", ") + ");"
);
statements.push(
  "INSERT INTO sessions (token_hash, player_id, expires_at, created_at) VALUES (" +
  [consentTokenHash, CONSENT_MEMBER.id, expiresAt, nowIso].map(sqlQuote).join(", ") + ");"
);


function insertSql(table, columns, values) {
  statements.push("INSERT INTO " + table + " (" + columns + ") VALUES (" +
    values.map(value => value === null ? "NULL" : sqlQuote(value)).join(", ") + ");");
}
const halloweenStart = "2026-10-25T12:00:00.000Z";
const halloweenEnd = "2026-11-01T12:00:00.000Z";
const halloweenStartSeconds = Math.floor(Date.parse(halloweenStart) / 1000);
const christmasStart = "2026-12-01T00:00:00.000Z";
const christmasEnd = "2027-01-01T00:00:00.000Z";
const christmasSeasonStart = "2025-12-01T00:00:00.000Z";
const christmasSeasonEnd = "2026-01-01T00:00:00.000Z";
const gymTimestamp1 = Math.floor(Date.parse("2026-11-12T12:00:00.000Z") / 1000);
const gymTimestamp2 = Math.floor(Date.parse("2026-11-14T12:00:00.000Z") / 1000);

// Recreate only the exact, named synthetic feature fixtures if this workflow is re-run.
statements.push("DELETE FROM api_keys WHERE player_id IN (SELECT player_id FROM players WHERE (player_id = " + sqlQuote(FEATURE_MEMBER.id) + " AND player_name = " + sqlQuote(FEATURE_MEMBER.name) + ") OR (player_id = " + sqlQuote(PARTIAL_MEMBER.id) + " AND player_name = " + sqlQuote(PARTIAL_MEMBER.name) + "));");
statements.push("DELETE FROM players WHERE (player_id = " + sqlQuote(FEATURE_MEMBER.id) + " AND player_name = " + sqlQuote(FEATURE_MEMBER.name) + ") OR (player_id = " + sqlQuote(PARTIAL_MEMBER.id) + " AND player_name = " + sqlQuote(PARTIAL_MEMBER.name) + ");");
// The second synthetic member explicitly shares its own staged Halloween history so
// the feature walkthrough can exercise comparison and visibility controls.
statements.push("UPDATE portal_user_consents SET historical_collection_enabled = 1, share_halloween_history = 1, updated_at = " + sqlQuote(nowIso) + " WHERE player_id = " + sqlQuote(MEMBERS[1].id) + ";");
statements.push("INSERT OR IGNORE INTO event_history_consent_records (player_id, event_key, first_consented_at) VALUES (" + [MEMBERS[1].id, "halloween", nowIso].map(sqlQuote).join(", ") + ");");

for (const member of [FEATURE_MEMBER, PARTIAL_MEMBER]) {
  const primaryKey = syntheticPrimaryKey(member.id);
  insertSql("players", "player_id, player_name, created_at, updated_at, faction_id, faction_verified_at",
    [member.id, member.name, nowIso, nowIso, "8317", nowIso]);
  insertSql("api_keys", "player_id, ciphertext, iv, last_four, created_at, updated_at",
    [member.id, primaryKey.ciphertext, primaryKey.iv, primaryKey.lastFour, nowIso, nowIso]);
  insertSql("portal_user_consents", "player_id, consent_version, policy_version, policy_acknowledged_at, api_key_usage_accepted, api_key_access_type, api_key_consent_acknowledged_at, api_key_consent_fingerprint, historical_collection_enabled, share_halloween_history, share_private_live, share_networth, created_at, updated_at",
    [member.id, "portal-data-policy-v3", "2026-11-15-v1", nowIso, 1, "custom", nowIso, primaryKey.fingerprint, 1, 1, 0, 0, nowIso, nowIso]);
}
insertSql("sessions", "token_hash, player_id, expires_at, created_at",
  [featureTokenHash, FEATURE_MEMBER.id, expiresAt, nowIso]);
insertSql("event_history_consent_records", "player_id, event_key, first_consented_at",
  [FEATURE_MEMBER.id, "halloween", nowIso]);
insertSql("event_history_consent_records", "player_id, event_key, first_consented_at",
  [FEATURE_MEMBER.id, "christmas-town", nowIso]);

// Two complete, shared Halloween member-years with deterministic Revitalize
// numerators/denominators, plus one failed member-year with retained partial logs.
const halloweenMembers = [
  { id: FEATURE_MEMBER.id, name: FEATURE_MEMBER.name, logCount: 2, hits: 1, attacksReviewed: 80, procs: 12, successes: 64, lost: 8, treats: 500, current: 35 },
  { id: MEMBERS[1].id, name: MEMBERS[1].name, logCount: 2, hits: 1, attacksReviewed: 60, procs: 5, successes: 50, lost: 6, treats: 260, current: 18 },
];
for (const [index, member] of halloweenMembers.entries()) {
  insertSql("halloween_member_event_slots", "event_year, player_id, start_minute_of_day, created_at, updated_at, source",
    [2026, member.id, 720, nowIso, nowIso, "torn_api"]);
  insertSql("halloween_collection_jobs", "job_id, player_id, event_year, status, cursor_ts, cursor_url, cursor_direction, pages_collected, logs_collected, last_error, created_at, updated_at, completed_at, window_start_at, window_end_at",
    ["staging-halloween-" + member.id, member.id, 2026, "complete", halloweenStartSeconds, null, null, 1, member.logCount, null, nowIso, nowIso, nowIso, halloweenStart, halloweenEnd]);
  insertSql("halloween_attack_metrics_jobs", "job_id, player_id, event_year, status, cursor_url, window_start_at, window_end_at, pages_collected, attacks_reviewed, revitalize_procs, revitalize_chances_json, last_error, created_at, updated_at, completed_at, successful_attacks, lost_stalemated_attacks, outcomes_version",
    ["staging-attack-" + member.id, member.id, 2026, "complete", null, halloweenStart, halloweenEnd, 1, member.attacksReviewed, member.procs, JSON.stringify({ "1": member.procs }), null, nowIso, nowIso, nowIso, member.successes, member.lost, 1]);
  const attackTimestamp = Math.floor(Date.parse("2026-10-27T16:00:00.000Z") / 1000);
  insertSql("halloween_event_logs", "event_year, player_id, log_id, event_timestamp, log_type_id, category, title, labels_json, is_hit, log_json, collected_at",
    [2026, member.id, "stg-halloween-attack-" + member.id, attackTimestamp, null, "Attacking", "Attack leave", "[]", 1,
      JSON.stringify({ data: { energy_used: 25 }, params: { color: "green" } }), nowIso]);
  insertSql("halloween_event_logs", "event_year, player_id, log_id, event_timestamp, log_type_id, category, title, labels_json, is_hit, log_json, collected_at",
    [2026, member.id, "stg-halloween-item-" + member.id, attackTimestamp + 60, 2535, "Item use", "Item use - Full Healing Cocktail", "[]", 0,
      JSON.stringify({ details: { category: "Item use", title: "Item use - Full Healing Cocktail" }, data: { item_id: 330, quantity: 1 } }), nowIso]);
  insertSql("halloween_live_snapshots", "event_year, player_id, captured_at, snapshot_kind, treats_current, treats_total, upgrades_json, payload_json, source_timestamp, collection_status",
    [2026, member.id, "2026-10-27T16:00:00.000Z", "manual", member.current, member.treats,
      JSON.stringify(["staging-upgrade-one", "staging-upgrade-two"]),
      JSON.stringify({ source: "synthetic-staging-fixture" }), attackTimestamp, "complete"]);
}
insertSql("halloween_collection_jobs", "job_id, player_id, event_year, status, cursor_ts, cursor_url, cursor_direction, pages_collected, logs_collected, last_error, created_at, updated_at, completed_at, window_start_at, window_end_at",
  ["staging-halloween-partial-" + PARTIAL_MEMBER.id, PARTIAL_MEMBER.id, 2026, "failed", halloweenStartSeconds, null, null, 1, 1, "Synthetic partial-coverage fixture", nowIso, nowIso, null, halloweenStart, halloweenEnd]);
insertSql("halloween_event_logs", "event_year, player_id, log_id, event_timestamp, log_type_id, category, title, labels_json, is_hit, log_json, collected_at",
  [2026, PARTIAL_MEMBER.id, "stg-halloween-partial-hit", Math.floor(Date.parse("2026-10-28T16:00:00Z") / 1000), null,
    "Attacking", "Attack mug", "[]", 1, JSON.stringify({ data: { energy_used: 25 }, params: { color: "green" } }), nowIso]);

// Both cached Torn calendar entries are deliberately fresh, so the staging
// walkthrough reads the real calendar code paths without issuing external Torn requests.
insertSql("torn_event_calendar_cache", "player_id, event_key, event_year, title, start_at, end_at, earliest_start_at, latest_end_at, fixed_start_time, personal_start_minute_of_day, fetched_at",
  [FEATURE_MEMBER.id, "halloween", 2026, "Trick or Treat", halloweenStart, halloweenEnd, halloweenStart, halloweenEnd, 1, null, nowIso]);
insertSql("torn_event_calendar_cache", "player_id, event_key, event_year, title, start_at, end_at, earliest_start_at, latest_end_at, fixed_start_time, personal_start_minute_of_day, fetched_at",
  [FEATURE_MEMBER.id, "christmas-town", 2026, "Christmas Town", christmasStart, christmasEnd, christmasStart, christmasEnd, 1, null, nowIso]);

// Christmas Town is intentionally a retained private archive after key disconnect.
// All-time view does not auto-queue collection; the one available season is complete.
insertSql("christmas_town_collection_jobs", "job_id, player_id, event_year, status, cursor_ts, cursor_url, cursor_direction, pages_collected, logs_collected, window_start_at, window_end_at, last_error, created_at, updated_at, completed_at",
  ["staging-christmas-" + FEATURE_MEMBER.id, FEATURE_MEMBER.id, 2025, "complete",
    Math.floor(Date.parse(christmasSeasonStart) / 1000), null, null, 1, 1, christmasSeasonStart, christmasSeasonEnd, null, nowIso, nowIso, nowIso]);
insertSql("christmas_town_event_logs", "player_id, event_year, log_id, event_timestamp, log_type_id, category, title, log_json, collected_at",
  [FEATURE_MEMBER.id, 2025, "stg-christmas-present-pick", Math.floor(Date.parse("2025-12-15T12:00:00.000Z") / 1000),
    null, "Christmas Town", "Present Pick",
    JSON.stringify({ details: { title: "Present Pick", category: "Christmas Town" }, data: {} }), nowIso]);

// Gym Training has a separate synthetic connection marker and private archive.
// No collector queue message is sent by seeding or by reading this completed job.
insertSql("gym_training_historical_keys", "player_id, last_four, access_level, last_validated_at, created_at, updated_at",
  [FEATURE_MEMBER.id, "4242", "Synthetic Custom Access", nowIso, nowIso, nowIso]);
insertSql("gym_training_collection_jobs", "job_id, player_id, status, cursor_url, cursor_direction, pages_collected, logs_scanned, logs_collected, last_error, created_at, updated_at, completed_at",
  ["staging-gym-training-" + FEATURE_MEMBER.id, FEATURE_MEMBER.id, "complete", null, null, 1, 18, 2, null, nowIso, nowIso, nowIso]);
insertSql("gym_training_event_logs", "player_id, log_id, event_timestamp, log_type_id, category, title, log_json, collected_at",
  [FEATURE_MEMBER.id, "stg-gym-training-1", gymTimestamp1, 1001, "Gym", "Gym training - Strength",
    JSON.stringify({ id: "stg-gym-training-1", timestamp: gymTimestamp1, details: { id: 1001, category: "Gym", title: "Gym training - Strength" }, data: { energy_spent: 25 } }), nowIso]);
insertSql("gym_training_event_logs", "player_id, log_id, event_timestamp, log_type_id, category, title, log_json, collected_at",
  [FEATURE_MEMBER.id, "stg-gym-training-2", gymTimestamp2, 1001, "Gym", "Gym training - Endurance",
    JSON.stringify({ id: "stg-gym-training-2", timestamp: gymTimestamp2, details: { id: 1001, category: "Gym", title: "Gym training - Endurance" }, data: { energy_spent: 25 } }), nowIso]);

const tempDir = mkdtempSync(join(tmpdir(), "ncd-private-history-seed-"));
const sqlPath = join(tempDir, "seed-private-history.sql");
try {
  writeFileSync(sqlPath, statements.join("\n") + "\n", "utf8");
  console.log("::add-mask::" + tokens[0]);
  console.log("::add-mask::" + tokens[1]);
  console.log("::add-mask::" + adminToken);
  console.log("::add-mask::" + featureToken);
  console.log("::add-mask::" + consentToken);
  console.log("Seeding synthetic first-login consent, private-history, feature-walkthrough, partial-coverage and administrator fixtures in the isolated acceptance D1.");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", [
    "wrangler", "d1", "execute", DATABASE, "--remote", "--config", CONFIG, "--file", sqlPath,
  ], { stdio: "inherit", env: process.env });

  const envValues = {
    STAGING_TEST_SESSION_TOKEN: tokens[0],
    STAGING_TEST_OTHER_SESSION_TOKEN: tokens[1],
    STAGING_FEATURE_SESSION_TOKEN: featureToken,
    STAGING_FEATURE_PLAYER_ID: FEATURE_MEMBER.id,
    STAGING_CONSENT_SESSION_TOKEN: consentToken,
    STAGING_CONSENT_PLAYER_ID: CONSENT_MEMBER.id,
    STAGING_TEST_ADMIN_SESSION_TOKEN: adminToken,
    STAGING_TEST_ADMIN_PLAYER_ID: ADMIN.id,
    STAGING_TEST_COMPANY_ID: COMPANY_ID,
    STAGING_TEST_PLAYER_ID: MEMBERS[0].id,
    STAGING_TEST_OTHER_PLAYER_ID: MEMBERS[1].id,
    STAGING_TEST_EXPECTED_INCOME_SERIES: JSON.stringify(incomeSeries[0]),
    STAGING_TEST_OTHER_INCOME_SERIES: JSON.stringify(incomeSeries[1]),
  };
  appendFileSync(process.env.GITHUB_ENV, Object.entries(envValues).map(([key, value]) => key + "=" + value).join("\n") + "\n");
  console.log("PASS seeded synthetic sessions, unconsented first-login account, private company history, Halloween/Christmas/Gym archives, Torn calendar cache rows, consent fixtures, and administrator access.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
