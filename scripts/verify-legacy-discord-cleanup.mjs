const ACCOUNT_ID = "6c03b978ed9a59adc3f61c715bdad45c";
const DASHBOARD_DB_ID = "bbbe128a-c5cc-46ec-b8ef-93860183e795";
const BOT_DB_ID = "46f7536d-f69c-4304-8b44-615901c60b7c";
const API_ROOT = "https://api.cloudflare.com/client/v4";
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error("CLOUDFLARE_API_TOKEN is required.");

async function request(path, body) {
  const response = await fetch(`${API_ROOT}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Cloudflare verification failed with HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.success !== true) throw new Error(`Cloudflare verification API error: ${JSON.stringify(payload.errors ?? [])}`);
  return payload.result;
}

async function query(dbId, sql) {
  const result = await request(`/accounts/${ACCOUNT_ID}/d1/database/${dbId}/query`, { sql });
  const statement = Array.isArray(result) ? result[0] : result;
  if (!statement?.success) throw new Error(`D1 verification SQL failed: ${sql}`);
  return statement.results ?? [];
}

async function verifyDatabase(dbId, retiredTables, requiredTables) {
  const rows = await query(dbId, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const names = new Set(rows.map((row) => String(row.name)));
  const remaining = retiredTables.filter((name) => names.has(name));
  const missing = requiredTables.filter((name) => !names.has(name));
  if (remaining.length) throw new Error(`Retired Discord tables remain: ${remaining.join(", ")}.`);
  if (missing.length) throw new Error(`Required active Discord tables are missing: ${missing.join(", ")}.`);

  const integrity = await query(dbId, "PRAGMA integrity_check");
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
    throw new Error("D1 integrity_check did not return ok.");
  }
  const fkViolations = await query(dbId, "PRAGMA foreign_key_check");
  if (fkViolations.length) throw new Error(`D1 foreign_key_check found ${fkViolations.length} violation(s).`);
  return { tableCount: names.size, retainedTables: requiredTables };
}

async function main() {
  const dashboard = await verifyDatabase(
    DASHBOARD_DB_ID,
    ["discord_alert_poll_history", "discord_alert_poll_health"],
    ["discord_account_links", "discord_link_codes", "global_company_rank_snapshot_meta"],
  );
  const bot = await verifyDatabase(
    BOT_DB_ID,
    [
      "alert_preferences", "alert_deliveries", "discord_alert_deliveries",
      "discord_alert_poll_escalations", "discord_alert_poll_state", "discord_alert_state",
    ],
    [
      "discord_links", "discord_daily_summary_deliveries",
      "discord_daily_company_summary_state", "discord_daily_company_summary_history",
    ],
  );

  const ledger = await query(DASHBOARD_DB_ID,
    "SELECT name FROM d1_migrations WHERE name='0039_retire_discord_poll_telemetry.sql'");
  if (ledger.length !== 1) throw new Error("Dashboard D1 migration 0039 is missing from the production migration ledger.");

  const healthResponse = await fetch("https://naughtyfamily-api.kboone801.workers.dev/health", {
    signal: AbortSignal.timeout(15_000),
  });
  const health = await healthResponse.json().catch(() => null);
  if (!healthResponse.ok || health?.ok !== true || health?.database !== "ok" || health?.keyEncryption !== "ok") {
    throw new Error("Production API Worker health failed after the D1 cleanup.");
  }

  const summary = [
    "## Retired Discord D1 cleanup verification",
    "",
    "- Dashboard D1 legacy poll telemetry: removed",
    "- Bot D1 legacy alert/poll tables: removed",
    "- Discord account-linking tables: retained",
    "- Discord daily-summary delivery/state/history tables: retained",
    "- Dashboard D1 ranking metadata singleton: retained",
    "- SQLite integrity and foreign-key checks: passed on both databases",
    "- Production API Worker health: passed",
    "",
    `Dashboard D1 tables remaining: ${dashboard.tableCount}`,
    `Bot D1 tables remaining: ${bot.tableCount}`,
  ].join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
  }
  console.log("PASS retired Discord D1 cleanup verification", JSON.stringify({ dashboard, bot }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
