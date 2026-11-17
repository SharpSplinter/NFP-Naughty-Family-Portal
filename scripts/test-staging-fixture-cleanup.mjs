import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  assertFixtureIdentityOutput, assertWranglerD1ReadBudget,
  buildFixtureCleanupStatements, parseWranglerD1Metrics, STAGING_FIXTURE_IDENTITIES,
} from "./staging-private-history-fixtures.mjs";

const db = new DatabaseSync(":memory:");
try {
  for (const name of readdirSync("migrations/auth").filter(name => name.endsWith(".sql")).sort()) {
    db.exec(readFileSync(join("migrations/auth", name), "utf8"));
  }
  const now = "2026-11-17T04:00:00.000Z";
  const addPlayer = db.prepare("INSERT INTO players (player_id, player_name, created_at, updated_at, faction_id, faction_verified_at) VALUES (?, ?, ?, ?, '8317', ?)");
  for (const row of STAGING_FIXTURE_IDENTITIES) addPlayer.run(row.playerId, row.playerName, now, now, now);
  addPlayer.run("888888888", "Unrelated member", now, now, now);

  db.prepare("INSERT INTO api_keys (player_id, ciphertext, iv, last_four, created_at, updated_at) VALUES ('999999005', 'synthetic', 'iv', '4242', ?, ?)").run(now, now);
  db.prepare("INSERT INTO sessions (token_hash, player_id, expires_at, created_at) VALUES ('synthetic-session', '999999005', 9999999999, ?)").run(now);
  db.prepare("INSERT INTO companies (player_id, company_id, company_name, company_type, profile_json, employees_json, fetched_at) VALUES ('999999001', '999999003', 'fixture', 'type', '{}', '{}', ?)").run(now);
  db.prepare("INSERT INTO company_snapshots (player_id, company_id, profile_json, employees_json, fetched_at) VALUES ('999999001', '999999003', '{}', '{}', ?)").run(now);
  db.prepare("INSERT INTO company_financial_snapshots (player_id, company_id, stock_json, fetched_at) VALUES ('999999001', '999999003', '[]', ?)").run(now);
  db.prepare("INSERT INTO administrators (player_id, granted_by, granted_at) VALUES ('999999004', '999999004', ?)").run(now);
  db.prepare("INSERT INTO admin_audit_log (actor_player_id, actor_player_name, action, outcome, summary, created_at) VALUES ('999999005', 'fixture', 'test', 'succeeded', 'fixture audit', ?)").run(now);
  db.prepare("INSERT INTO admin_jobs (job_id, job_type, target_player_id, status, requested_by, created_at) VALUES ('fixture-job', 'test', '999999005', 'completed', '999999004', ?)").run(now);
  db.prepare("INSERT INTO discord_link_codes (code, owner_player_id, ciphertext, iv, expires_at) VALUES ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '999999005', 'x', 'y', ?)").run(now);
  db.prepare("INSERT INTO discord_account_links (owner_player_id, discord_user_id, alerts_enabled, linked_at, updated_at) VALUES ('999999005', '999999999999999999', 0, ?, ?)").run(now, now);

  const addHalloweenLog = db.prepare("INSERT INTO halloween_event_logs (event_year, player_id, log_id, event_timestamp, labels_json, is_hit, log_json, collected_at) VALUES (?, ?, ?, 1, '[]', 0, '{}', ?)");
  addHalloweenLog.run(2026, "999999005", "fixture-current", now);
  addHalloweenLog.run(2025, "999999005", "fixture-prior-year", now);
  for (let i = 0; i < 2500; i += 1) addHalloweenLog.run(2026, "888888888", "unrelated-" + i, now);
  db.prepare("INSERT INTO halloween_live_snapshots (event_year, player_id, captured_at, upgrades_json, payload_json) VALUES (2026, '999999005', ?, '[]', '{}')").run(now);
  db.prepare("INSERT INTO halloween_member_event_slots (event_year, player_id, start_minute_of_day, created_at, updated_at) VALUES (2026, '999999005', 720, ?, ?)").run(now, now);
  db.prepare("INSERT INTO halloween_collection_jobs (job_id, player_id, event_year, status, cursor_ts, created_at, updated_at) VALUES ('fixture-halloween', '999999005', 2026, 'complete', 0, ?, ?)").run(now, now);
  db.prepare("INSERT INTO halloween_attack_metrics_jobs (job_id, player_id, event_year, status, window_start_at, window_end_at, created_at, updated_at) VALUES ('fixture-attack', '999999005', 2026, 'complete', '2026-10-25T00:00:00Z', '2026-11-01T00:00:00Z', ?, ?)").run(now, now);
  db.prepare("INSERT INTO halloween_live_snapshot_jobs (job_id, event_year, player_id, snapshot_kind, bucket_start, status, created_at, updated_at) VALUES ('fixture-snapshot', 2026, '999999005', 'opening', 1, 'complete', ?, ?)").run(now, now);
  db.prepare("INSERT INTO event_history_consent_records (player_id, event_key, first_consented_at) VALUES ('999999005', 'halloween', ?)").run(now);
  db.prepare("INSERT INTO torn_event_calendar_cache (player_id, event_key, event_year, title, start_at, end_at, earliest_start_at, latest_end_at, fixed_start_time, fetched_at) VALUES ('999999005', 'halloween', 2026, 'fixture', ?, ?, ?, ?, 1, ?)").run(now, now, now, now, now);
  db.prepare("INSERT INTO christmas_town_collection_jobs (job_id, player_id, event_year, status, cursor_ts, window_start_at, window_end_at, created_at, updated_at) VALUES ('fixture-christmas', '999999005', 2025, 'complete', 1, '2025-12-01', '2026-01-01', ?, ?)").run(now, now);
  db.prepare("INSERT INTO christmas_town_event_logs (player_id, event_year, log_id, event_timestamp, log_json, collected_at) VALUES ('999999005', 2025, 'fixture-present', 1, '{}', ?)").run(now);
  db.prepare("INSERT INTO gym_training_historical_keys (player_id, last_four, access_level, last_validated_at, created_at, updated_at) VALUES ('999999005', '4242', 'Custom Access', ?, ?, ?)").run(now, now, now);
  db.prepare("INSERT INTO gym_training_collection_jobs (job_id, player_id, status, created_at, updated_at) VALUES ('fixture-gym', '999999005', 'complete', ?, ?)").run(now, now);
  db.prepare("INSERT INTO gym_training_event_logs (player_id, log_id, event_timestamp, log_json, collected_at) VALUES ('999999005', 'fixture-training', 1, '{}', ?)").run(now);
  db.prepare("INSERT INTO event_history_consent_records (player_id, event_key, first_consented_at) VALUES ('999999005', 'christmas-town', ?)").run(now);

  const sql = buildFixtureCleanupStatements({
    createdAt: "2026-11-17T03:59:00.000Z",
    discordLinkCode: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    deactivatePlayers: true,
  });
  for (const statement of sql.filter(item => !item.startsWith("PRAGMA"))) {
    const plan = db.prepare("EXPLAIN QUERY PLAN " + statement).all().map(row => String(row.detail)).join(" | ");
    assert.doesNotMatch(plan, /\bSCAN\b/i, "Fixture cleanup must use indexed access: " + statement + " => " + plan);
  }
  db.exec(sql.join("\n"));

  assert.equal(db.prepare("SELECT faction_id FROM players WHERE player_id='999999005'").get().faction_id, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM players WHERE player_id='999999005'").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM api_keys WHERE player_id='999999005'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE player_id='999999005'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM companies WHERE player_id='999999001'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM company_snapshots WHERE player_id='999999001'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM company_financial_snapshots WHERE player_id='999999001'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM halloween_event_logs WHERE player_id='999999005'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM halloween_event_logs WHERE player_id='888888888'").get().n, 2500);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM halloween_live_snapshots WHERE player_id='999999005'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM halloween_member_event_slots WHERE player_id='999999005'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM halloween_collection_jobs WHERE player_id='999999005'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM halloween_attack_metrics_jobs WHERE player_id='999999005'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM halloween_live_snapshot_jobs WHERE player_id='999999005'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM christmas_town_event_logs WHERE player_id='999999005'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM gym_training_event_logs WHERE player_id='999999005'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM discord_link_codes WHERE code='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM discord_account_links WHERE owner_player_id='999999005'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_audit_log WHERE actor_player_id='999999005'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_jobs WHERE target_player_id='999999005'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM players WHERE player_id='888888888'").get().n, 1);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);

  assert.deepEqual(parseWranglerD1Metrics("Executed 8 queries (234 rows read, 78 rows written)"), { rowsRead: 234, rowsWritten: 78 });
  assert.deepEqual(parseWranglerD1Metrics('[{"rows_read":12,"rows_written":3}]'), { rowsRead: 12, rowsWritten: 3 });
  assertFixtureIdentityOutput(JSON.stringify({ results: [{ player_id: "999999005", player_name: "Staging Feature Walkthrough Member" }] }));
  assert.throws(() => assertFixtureIdentityOutput(JSON.stringify({ results: [{ player_id: "999999005", player_name: "Wrong identity" }] })), /different player name/);
  assertWranglerD1ReadBudget({ rowsRead: 9999 }, "test");
  assert.throws(() => assertWranglerD1ReadBudget({ rowsRead: 10001 }, "test"), /exceeded its direct D1 read budget/);
  assert.throws(() => parseWranglerD1Metrics("No metrics"), /did not include direct rows-read/);
  console.log("PASS fixture cleanup regression: indexed access only, unrelated 2,500-row archive preserved, credentials removed and reserved identities deactivated.");
} finally {
  db.close();
}
