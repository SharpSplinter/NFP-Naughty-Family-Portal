import { appendFileSync } from "node:fs";

const ACCOUNT_ID = "6c03b978ed9a59adc3f61c715bdad45c";
const DASHBOARD_DB_ID = "bbbe128a-c5cc-46ec-b8ef-93860183e795";
const BOT_DB_ID = "46f7536d-f69c-4304-8b44-615901c60b7c";
const REPOSITORY = "SharpSplinter/Naughty-Company-Dashboard";
const REQUIRED_ACK = "I approve removal of retired Discord telemetry and alert tables after production Worker verification";
const API_ROOT = "https://api.github.com";
const CF_ROOT = "https://api.cloudflare.com/client/v4";

function parseHttps(value, label) {
  const parsed = new URL(String(value ?? ""));
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error(`${label} must be a valid HTTPS reference.`);
  }
  return parsed;
}

function parseTime(value, label, maxAgeMs, nowMs) {
  const ms = Date.parse(String(value ?? ""));
  if (!Number.isFinite(ms) || ms > nowMs + 60_000 || nowMs - ms > maxAgeMs) {
    throw new Error(`${label} is invalid, future-dated, or too old for cleanup.`);
  }
  return ms;
}

async function jsonRequest(url, headers, label) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  return response.json();
}

async function cloudflareRequest(path, token) {
  const payload = await jsonRequest(`${CF_ROOT}${path}`, {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  }, "Cloudflare preflight");
  if (payload.success !== true) {
    throw new Error(`Cloudflare preflight failed: ${JSON.stringify(payload.errors ?? [])}`);
  }
  return payload.result;
}

async function githubRequest(path, token) {
  return jsonRequest(API_ROOT + path, {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  }, "GitHub evidence lookup");
}

async function cloudflareSqlQuery(databaseId, sql, token) {
  const response = await fetch(CF_ROOT + "/accounts/" + ACCOUNT_ID + "/d1/database/" + databaseId + "/query", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Cloudflare D1 preflight query failed with HTTP " + response.status + ".");
  const payload = await response.json();
  if (payload.success !== true) throw new Error("Cloudflare D1 preflight query failed.");
  const statement = Array.isArray(payload.result) ? payload.result[0] : payload.result;
  if (!statement?.success) throw new Error("Cloudflare D1 preflight SQL statement did not succeed.");
  return statement.results ?? [];
}

async function main() {
  const env = process.env;
  const now = Date.now();
  function readEvidence(envKey, requiredFields) {
    let parsed;
    try {
      parsed = JSON.parse(String(env[envKey] ?? ""));
    } catch {
      throw new Error(envKey + " must be valid JSON.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(envKey + " must be a JSON object.");
    }
    for (const field of requiredFields) {
      if (typeof parsed[field] !== "string" || !parsed[field].trim()) {
        throw new Error(envKey + "." + field + " must be a non-empty string.");
      }
    }
    return parsed;
  }

  const dashboardBackupEvidence = readEvidence("DASHBOARD_BACKUP_EVIDENCE", ["reference", "sha256", "created_at"]);
  const botBackupEvidence = readEvidence("BOT_BACKUP_EVIDENCE", ["reference", "created_at"]);
  const d1ReleaseEvidence = readEvidence("D1_RELEASE_EVIDENCE", [
    "bookmark_reference", "usage_reference", "usage_checked_at",
    "rows_read", "hard_stop_rows", "release_reserve_rows",
  ]);
  env.BACKUP_REFERENCE = dashboardBackupEvidence.reference;
  env.BACKUP_SHA256 = dashboardBackupEvidence.sha256;
  env.BACKUP_CREATED_AT = dashboardBackupEvidence.created_at;
  env.BOT_BACKUP_REFERENCE = botBackupEvidence.reference;
  env.BOT_BACKUP_CREATED_AT = botBackupEvidence.created_at;
  env.TIME_TRAVEL_BOOKMARK_REFERENCE = d1ReleaseEvidence.bookmark_reference;
  env.D1_USAGE_REFERENCE = d1ReleaseEvidence.usage_reference;
  env.D1_USAGE_CHECKED_AT = d1ReleaseEvidence.usage_checked_at;
  env.D1_ROWS_READ = d1ReleaseEvidence.rows_read;
  env.D1_HARD_STOP_ROWS = d1ReleaseEvidence.hard_stop_rows;
  env.D1_RELEASE_RESERVE_ROWS = d1ReleaseEvidence.release_reserve_rows;
  const required = [
    "GITHUB_TOKEN", "CLOUDFLARE_API_TOKEN", "GITHUB_SHA", "GITHUB_REF",
    "CANDIDATE_COMMIT", "EXPECTED_API_VERSION", "EXPECTED_BOT_VERSION", "RELEASE_AUTHORIZATION",
    "BACKUP_REFERENCE", "BACKUP_SHA256", "BACKUP_CREATED_AT",
    "BOT_BACKUP_REFERENCE", "BOT_BACKUP_CREATED_AT",
    "TIME_TRAVEL_BOOKMARK_REFERENCE", "D1_USAGE_REFERENCE",
    "D1_USAGE_CHECKED_AT", "D1_ROWS_READ", "D1_HARD_STOP_ROWS",
    "D1_RELEASE_RESERVE_ROWS", "RESTORE_REHEARSAL_RUN_URL",
    "RESTORE_REHEARSAL_COMMIT",
  ];
  const missing = required.filter((key) => !String(env[key] ?? "").trim());
  if (missing.length) throw new Error(`Missing cleanup evidence: ${missing.join(", ")}.`);
  if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REF !== "refs/heads/main") {
    throw new Error("Cleanup must run from main in the canonical repository.");
  }
  if (env.CONFIRM_TARGET !== "naughtyfamily-api-and-naughty-company-bot-production-d1") {
    throw new Error("Both production D1 targets must be explicitly confirmed.");
  }
  if (env.RELEASE_AUTHORIZATION !== REQUIRED_ACK) {
    throw new Error("Explicit cleanup authorization is required.");
  }
  if (!/^[a-f0-9]{40}$/i.test(env.CANDIDATE_COMMIT) || env.CANDIDATE_COMMIT !== env.GITHUB_SHA) {
    throw new Error("The cleanup candidate must be the exact main workflow commit.");
  }
  if (!/^[a-f0-9]{40}$/i.test(env.RESTORE_REHEARSAL_COMMIT) || env.RESTORE_REHEARSAL_COMMIT !== env.CANDIDATE_COMMIT) {
    throw new Error("The successful restore rehearsal must use the exact cleanup candidate commit.");
  }
  if (!/^[a-f0-9]{64}$/i.test(env.BACKUP_SHA256)) {
    throw new Error("The encrypted dashboard backup checksum must be 64 hexadecimal characters.");
  }
  if (!/^[0-9a-f-]{36}$/i.test(env.EXPECTED_API_VERSION)) {
    throw new Error("EXPECTED_API_VERSION must be the exact deployed API Worker version UUID.");
  }
  if (!/^[0-9a-f-]{36}$/i.test(env.EXPECTED_BOT_VERSION)) {
    throw new Error("EXPECTED_BOT_VERSION must be the exact deployed Discord bot Worker version UUID.");
  }

  const backupUrl = parseHttps(env.BACKUP_REFERENCE, "Dashboard backup");
  const botBackupUrl = parseHttps(env.BOT_BACKUP_REFERENCE, "Bot database backup");
  const bookmarkUrl = parseHttps(env.TIME_TRAVEL_BOOKMARK_REFERENCE, "Time Travel bookmark");
  const usageUrl = parseHttps(env.D1_USAGE_REFERENCE, "D1 Insights reference");
  const driveHosts = new Set(["drive.google.com", "drive.usercontent.google.com"]);
  if (!driveHosts.has(backupUrl.hostname) || !driveHosts.has(botBackupUrl.hostname)) {
    throw new Error("Both pre-cleanup backups must be stored in the connected Google Drive.");
  }
  if (bookmarkUrl.hostname !== "api.cloudflare.com" || usageUrl.hostname !== "api.cloudflare.com") {
    throw new Error("Bookmark and D1 Insights references must point to the Cloudflare API.");
  }
  parseTime(env.BACKUP_CREATED_AT, "Dashboard backup", 24 * 60 * 60 * 1000, now);
  parseTime(env.BOT_BACKUP_CREATED_AT, "Bot database backup", 24 * 60 * 60 * 1000, now);
  parseTime(env.D1_USAGE_CHECKED_AT, "D1 usage snapshot", 15 * 60 * 1000, now);

  const rowsReadInput = Number(env.D1_ROWS_READ);
  const hardStop = Number(env.D1_HARD_STOP_ROWS);
  const reserve = Number(env.D1_RELEASE_RESERVE_ROWS);
  if (!Number.isSafeInteger(rowsReadInput) || rowsReadInput < 0 ||
      !Number.isSafeInteger(hardStop) || hardStop < 1 ||
      !Number.isSafeInteger(reserve) || reserve < 1) {
    throw new Error("D1 read usage, hard stop, and reserve must be positive safe integers.");
  }

  const runMatch = env.RESTORE_REHEARSAL_RUN_URL.match(
    /^https:\/\/github\.com\/SharpSplinter\/Naughty-Company-Dashboard\/actions\/runs\/(\d+)\/?$/,
  );
  if (!runMatch) throw new Error("Restore rehearsal reference must be a run URL in this repository.");

  const ghHeaders = env.GITHUB_TOKEN;
  const cfToken = env.CLOUDFLARE_API_TOKEN;
  const [restoreRun, candidateCommit, releaseCommit, restoreCommit, deployment, botDeployment, dashboardBookmark, botBookmark, insights, dashboardLedger, dashboardTables, botTables] =
    await Promise.all([
      githubRequest("/repos/" + REPOSITORY + "/actions/runs/" + runMatch[1], ghHeaders),
      githubRequest("/repos/" + REPOSITORY + "/commits/" + env.CANDIDATE_COMMIT, ghHeaders),
      githubRequest("/repos/" + REPOSITORY + "/commits/" + env.GITHUB_SHA, ghHeaders),
      githubRequest("/repos/" + REPOSITORY + "/commits/" + env.RESTORE_REHEARSAL_COMMIT, ghHeaders),
      cloudflareRequest("/accounts/" + ACCOUNT_ID + "/workers/scripts/naughtyfamily-api/deployments", cfToken),
      cloudflareRequest("/accounts/" + ACCOUNT_ID + "/workers/scripts/naughty-company-bot/deployments", cfToken),
      cloudflareRequest("/accounts/" + ACCOUNT_ID + "/d1/database/" + DASHBOARD_DB_ID + "/time_travel/bookmark", cfToken),
      cloudflareRequest("/accounts/" + ACCOUNT_ID + "/d1/database/" + BOT_DB_ID + "/time_travel/bookmark", cfToken),
      cloudflareRequest(
        "/accounts/" + ACCOUNT_ID + "/d1/insights/databases?order_by=rows_read&since=" +
          encodeURIComponent(new Date().toISOString().slice(0, 10) + "T00:00:00Z") +
          "&until=" + encodeURIComponent(new Date().toISOString()) + "&limit=1000",
        cfToken,
      ),
      cloudflareSqlQuery(DASHBOARD_DB_ID, "SELECT name FROM d1_migrations WHERE name IN ('0038_global_company_rank_snapshot_meta.sql', '0039_retire_discord_poll_telemetry.sql') ORDER BY name", cfToken),
      cloudflareSqlQuery(DASHBOARD_DB_ID, "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('discord_alert_poll_history', 'discord_alert_poll_health', 'discord_account_links', 'discord_link_codes', 'global_company_rank_snapshot_meta') ORDER BY name", cfToken),
      cloudflareSqlQuery(BOT_DB_ID, "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('alert_preferences', 'alert_deliveries', 'discord_alert_deliveries', 'discord_alert_poll_escalations', 'discord_alert_poll_state', 'discord_alert_state', 'discord_links', 'discord_daily_summary_deliveries', 'discord_daily_company_summary_state', 'discord_daily_company_summary_history') ORDER BY name", cfToken),
    ]);

  if (restoreRun.status !== "completed" || restoreRun.conclusion !== "success" ||
      restoreRun.head_sha !== env.RESTORE_REHEARSAL_COMMIT ||
      restoreRun.path !== ".github/workflows/restore-production-backup-rehearsal.yml") {
    throw new Error("The exact-candidate production-data restore rehearsal is not successful.");
  }
  const releaseTree = releaseCommit.commit?.tree?.sha;
  if (!releaseTree || candidateCommit.commit?.tree?.sha !== releaseTree ||
      restoreCommit.commit?.tree?.sha !== releaseTree) {
    throw new Error("Cleanup candidate, main release, and successful restore rehearsal do not share one Git tree.");
  }

  const deployments = deployment?.deployments ?? [];
  const activeDeployment = deployments[0];
  const activeVersion = activeDeployment?.versions?.find((item) => Number(item.percentage) === 100)?.version_id;
  if (activeVersion !== env.EXPECTED_API_VERSION) {
    throw new Error("Production API Worker version changed: expected " + env.EXPECTED_API_VERSION + ", found " + (activeVersion ?? "unknown") + ".");
  }
  const activeBotVersion = botDeployment?.deployments?.[0]?.versions?.find((item) => Number(item.percentage) === 100)?.version_id;
  if (activeBotVersion !== env.EXPECTED_BOT_VERSION) {
    throw new Error("Production bot Worker version changed: expected " + env.EXPECTED_BOT_VERSION + ", found " + (activeBotVersion ?? "unknown") + ".");
  }

  const [healthResponse, botHealthResponse] = await Promise.all([
    fetch("https://naughtyfamily-api.kboone801.workers.dev/health", { signal: AbortSignal.timeout(15_000) }),
    fetch("https://naughty-company-bot.kboone801.workers.dev/health", { signal: AbortSignal.timeout(15_000) }),
  ]);
  const [health, botHealth] = await Promise.all([
    healthResponse.json().catch(() => null),
    botHealthResponse.json().catch(() => null),
  ]);
  if (!healthResponse.ok || health?.ok !== true || health?.database !== "ok" || health?.keyEncryption !== "ok") {
    throw new Error("The live production API Worker health check failed.");
  }
  if (!botHealthResponse.ok || botHealth?.ok !== true || botHealth?.service !== "naughty-company-bot" ||
      botHealth?.database !== true || botHealth?.encryption !== true || botHealth?.discordConfigured !== true ||
      botHealth?.dashboardBinding !== true || botHealth?.privateDailySummary !== true) {
    throw new Error("The live production Discord bot is not healthy as the configured private daily-summary Worker.");
  }

  const dashboardLedgerNames = new Set(dashboardLedger.map((row) => String(row.name)));
  if (!dashboardLedgerNames.has("0038_global_company_rank_snapshot_meta.sql") || dashboardLedgerNames.has("0039_retire_discord_poll_telemetry.sql")) {
    throw new Error("Dashboard D1 must have migration 0038 applied and 0039 pending before cleanup.");
  }
  const dashboardTableNames = new Set(dashboardTables.map((row) => String(row.name)));
  const expectedDashboardTables = ["discord_alert_poll_history", "discord_alert_poll_health", "discord_account_links", "discord_link_codes", "global_company_rank_snapshot_meta"];
  const missingDashboardTables = expectedDashboardTables.filter((name) => !dashboardTableNames.has(name));
  if (missingDashboardTables.length) throw new Error("Dashboard D1 cleanup target tables are missing: " + missingDashboardTables.join(", ") + ".");
  const botTableNames = new Set(botTables.map((row) => String(row.name)));
  const expectedBotTables = ["alert_preferences", "alert_deliveries", "discord_alert_deliveries", "discord_alert_poll_escalations", "discord_alert_poll_state", "discord_alert_state", "discord_links", "discord_daily_summary_deliveries", "discord_daily_company_summary_state", "discord_daily_company_summary_history"];
  const missingBotTables = expectedBotTables.filter((name) => !botTableNames.has(name));
  if (missingBotTables.length) throw new Error("Bot D1 cleanup target or retained tables are missing: " + missingBotTables.join(", ") + ".");

  const liveRowsRead = (insights ?? []).reduce((sum, item) => sum + Number(item.rows_read ?? 0), 0);
  if (liveRowsRead + reserve > hardStop || rowsReadInput + reserve > hardStop) {
    throw new Error("Current account-wide D1 reads plus cleanup reserve exceed the declared hard stop.");
  }
  if (!dashboardBookmark?.bookmark || !botBookmark?.bookmark) {
    throw new Error("Fresh Time Travel bookmarks could not be retrieved for both production D1 databases.");
  }

  const summary = [
    "## Retired Discord D1 cleanup preflight",
    "",
    "- Exact candidate and restore rehearsal commit: passed",
    "- Encrypted dashboard backup reference, checksum format, and freshness: passed",
    "- Bot D1 SQL export reference and freshness: passed",
    "- Production API Worker and private daily-summary bot versions and health: passed",
    "- Dashboard D1 ledger has 0038 applied and 0039 pending; exact cleanup targets and retained Discord tables are present",
    "- Fresh dashboard and bot D1 Time Travel bookmarks: retrieved",
    "- Fresh account-wide D1 Insights and deployment reserve: passed",
    "",
    `Production API Worker version: ${activeVersion}`,
    `Production bot Worker version: ${activeBotVersion}`,
    `Dashboard D1 bookmark: ${dashboardBookmark.bookmark}`,
    `Bot D1 bookmark: ${botBookmark.bookmark}`,
    `D1 rows read: input ${rowsReadInput}; live Insights ${liveRowsRead}; hard stop ${hardStop}; reserve ${reserve}`,
    `Dashboard backup: ${env.BACKUP_REFERENCE}`,
    `Bot D1 backup: ${env.BOT_BACKUP_REFERENCE}`,
    "",
    "No D1 schema or data was changed by this preflight.",
  ].join("\n");
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, summary + "\n");
  console.log("Retired Discord cleanup preflight passed; production D1 changes are still pending.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
