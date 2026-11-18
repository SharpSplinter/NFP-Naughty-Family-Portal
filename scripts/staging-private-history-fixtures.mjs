import assert from "node:assert/strict";
import { readFileSync, renameSync, writeFileSync } from "node:fs";

export const STAGING_FIXTURE_IDENTITIES = Object.freeze([
  { playerId: "999999001", playerName: "Staging Private History Member" },
  { playerId: "999999002", playerName: "Staging Private History Other Member" },
  { playerId: "999999004", playerName: "Staging Private History Admin" },
  { playerId: "999999005", playerName: "Staging Feature Walkthrough Member" },
  { playerId: "999999006", playerName: "Staging Partial Archive Member" },
  { playerId: "999999007", playerName: "Staging First Login Consent Member" },
]);
const PLAYER_IDS = STAGING_FIXTURE_IDENTITIES.map(row => row.playerId);
const PLAYER_ID_SQL = PLAYER_IDS.map(value => "'" + value + "'").join(", ");
const PLAYER_ID_FILTER = "IN (" + PLAYER_ID_SQL + ")";
const ACCOUNT_ID = "6c03b978ed9a59adc3f61c715bdad45c";

export function sqlQuote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

export function buildFixtureCleanupStatements({ createdAt = null, discordLinkCode = null, deactivatePlayers = false } = {}) {
  const statements = ["PRAGMA foreign_keys = ON;"];
  if (createdAt) {
    const timestamp = sqlQuote(createdAt);
    statements.push("DELETE FROM admin_audit_log WHERE created_at >= " + timestamp + " AND actor_player_id " + PLAYER_ID_FILTER + ";");
    statements.push("DELETE FROM admin_jobs WHERE created_at >= " + timestamp + " AND target_player_id " + PLAYER_ID_FILTER + ";");
  }
  // discord_link_codes.owner_player_id has no index, so address its one
  // synthetic row through the code primary key rather than scanning the table.
  if (discordLinkCode) {
    assert.match(discordLinkCode, /^[a-f0-9]{48}$/, "Refusing to delete a Discord link code that is not synthetic.");
    statements.push("DELETE FROM discord_link_codes WHERE code = " + sqlQuote(discordLinkCode) + ";");
  }
  statements.push("DELETE FROM discord_account_links WHERE owner_player_id " + PLAYER_ID_FILTER + ";");
  statements.push("DELETE FROM discord_alert_poll_history WHERE owner_player_id " + PLAYER_ID_FILTER + ";");
  statements.push("DELETE FROM discord_alert_poll_health WHERE owner_player_id " + PLAYER_ID_FILTER + ";");

  // Use existing player-leading primary keys/indexes for direct child cleanup.
  // Never delete players: several event archive FKs lack player-leading indexes.
  const playerTables = [
    ["api_keys", "player_id"], ["sessions", "player_id"],
    ["company_snapshots", "player_id"], ["company_financial_snapshots", "player_id"],
    ["companies", "player_id"], ["company_keys", "player_id"],
    ["company_api_keys", "player_id"], ["company_financials", "player_id"],
    ["company_data_sharing", "player_id"], ["company_sharing_preferences", "player_id"],
    ["dashboard_member_status", "player_id"], ["administrators", "player_id"],
    ["halloween_historical_keys", "player_id"], ["halloween_collection_jobs", "player_id"],
    ["halloween_api_throttles", "player_id"],
    ["member_private_live_keys", "player_id"], ["member_private_live_api_throttles", "player_id"],
    ["faction_member_private_live_snapshots", "player_id"],
    ["christmas_town_historical_keys", "player_id"], ["christmas_town_collection_jobs", "player_id"],
    ["christmas_town_event_logs", "player_id"], ["event_history_consent_records", "player_id"],
    ["torn_event_calendar_cache", "player_id"], ["portal_user_consents", "player_id"],
    ["portal_member_key_capabilities", "player_id"],
    ["gym_training_historical_keys", "player_id"], ["gym_training_collection_jobs", "player_id"],
    ["gym_training_event_logs", "player_id"],
    ["automation_preferences", "owner_player_id"], ["automation_webhooks", "owner_player_id"],
    ["automation_delivery_log", "owner_player_id"],
  ];
  for (const [table, column] of playerTables) {
    statements.push("DELETE FROM " + table + " WHERE " + column + " " + PLAYER_ID_FILTER + ";");
  }

  // Event archive composite indexes start with event_year. Pin the synthetic
  // season so unrelated members and years are not read during cleanup.
  for (const table of [
    "halloween_attack_metrics_jobs", "halloween_live_snapshot_jobs",
    "halloween_event_logs", "halloween_live_snapshots", "halloween_member_event_slots",
  ]) {
    statements.push("DELETE FROM " + table + " WHERE event_year = 2026 AND player_id " + PLAYER_ID_FILTER + ";");
  }

  if (deactivatePlayers) {
    const timestamp = sqlQuote(createdAt || new Date().toISOString());
    const identityFilter = STAGING_FIXTURE_IDENTITIES.map(row =>
      "(player_id = " + sqlQuote(row.playerId) + " AND player_name = " + sqlQuote(row.playerName) + ")"
    ).join(" OR ");
    statements.push("UPDATE players SET faction_id = NULL, faction_verified_at = NULL, updated_at = " +
      timestamp + " WHERE " + identityFilter + ";");
  }
  return statements;
}

export function parseWranglerD1Metrics(output) {
  const text = String(output ?? "");
  const matches = [...text.matchAll(/\(([\d,]+)\s+rows read,\s*([\d,]+)\s+rows written\)/gi)];
  if (matches.length) {
    const match = matches[matches.length - 1];
    return { rowsRead: Number(match[1].replace(/,/g, "")), rowsWritten: Number(match[2].replace(/,/g, "")) };
  }
  const read = text.match(/["'](?:Rows read|rows_read|rowsRead)["']?\s*:\s*([\d,]+)/i);
  const written = text.match(/["'](?:Rows written|rows_written|rowsWritten)["']?\s*:\s*([\d,]+)/i);
  if (read && written) {
    return { rowsRead: Number(read[1].replace(/,/g, "")), rowsWritten: Number(written[1].replace(/,/g, "")) };
  }
  throw new Error("Wrangler D1 output did not include direct rows-read and rows-written metrics. Refusing an unmetered fixture operation.");
}

export function assertWranglerD1ReadBudget(metrics, label, maximumRows = 10000) {
  assert.ok(Number.isSafeInteger(maximumRows) && maximumRows > 0 && maximumRows <= 10000,
    "Fixture operations cannot raise their hard 10,000-row direct-read ceiling.");
  assert.ok(Number.isSafeInteger(metrics?.rowsRead) && metrics.rowsRead >= 0,
    label + " returned an invalid D1 rows-read metric.");
  if (metrics.rowsRead > maximumRows) {
    throw new Error(label + " exceeded its direct D1 read budget: " + metrics.rowsRead.toLocaleString("en-US") +
      " rows read; maximum is " + maximumRows.toLocaleString("en-US") + ".");
  }
}

export function recordWranglerD1Metrics(metrics, label, maximumRows = 10000) {
  assertWranglerD1ReadBudget(metrics, label, maximumRows);
  const statePath = process.env.D1_BUDGET_STATE_FILE || "";
  assert.ok(statePath, "D1_BUDGET_STATE_FILE is required for cumulative direct rows-read accounting.");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state.accountId, ACCOUNT_ID, "Direct rows-read meter belongs to a different Cloudflare account.");
  assert.ok(typeof state.utcDate === "string", "Direct rows-read meter has no UTC date.");
  const prior = Number(state.directRowsRead ?? 0);
  assert.ok(Number.isSafeInteger(prior) && prior >= 0, "Direct rows-read meter state is invalid.");
  const total = prior + metrics.rowsRead;
  const runLimit = Number(process.env.D1_RUN_BUDGET_ROWS || 100000);
  assert.ok(Number.isSafeInteger(runLimit) && runLimit > 0 && runLimit <= 100000,
    "The cumulative direct D1 rows-read budget cannot exceed 100,000 rows.");
  if (total > runLimit) {
    throw new Error("Cumulative direct Wrangler D1 reads exceeded the hard per-run budget: " +
      total.toLocaleString("en-US") + " rows read; maximum is " + runLimit.toLocaleString("en-US") + ".");
  }
  state.directRowsRead = total;
  state.directReadOperations = Number(state.directReadOperations || 0) + 1;
  const temporaryPath = statePath + ".tmp";
  writeFileSync(temporaryPath, JSON.stringify(state, null, 2) + "\n");
  renameSync(temporaryPath, statePath);
  console.log("DIRECT D1 READ METER " + JSON.stringify({
    operation: label, rowsRead: metrics.rowsRead, rowsWritten: metrics.rowsWritten,
    cumulativeWranglerRowsRead: total, cumulativeLimit: runLimit,
  }));
}

export function assertFixtureIdentityOutput(output) {
  let payload;
  try { payload = JSON.parse(String(output)); }
  catch { throw new Error("Could not parse the JSON result of the reserved staging fixture identity preflight."); }
  const expected = new Map(STAGING_FIXTURE_IDENTITIES.map(row => [row.playerId, row.playerName]));
  const found = [];
  const visit = value => {
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    if (!value || typeof value !== "object") return;
    if (typeof value.player_id === "string" && typeof value.player_name === "string") found.push(value);
    for (const child of Object.values(value)) visit(child);
  };
  visit(payload);
  for (const row of found) {
    const expectedName = expected.get(row.player_id);
    if (expectedName && row.player_name !== expectedName) {
      throw new Error("Refusing to attach synthetic data to reserved player ID " + row.player_id +
        " because it belongs to a different player name.");
    }
  }
  return found;
}
