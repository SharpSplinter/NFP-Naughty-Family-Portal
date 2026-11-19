import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../.github/workflows/cleanup-legacy-discord-tables.yml", import.meta.url), "utf8");
const preflight = readFileSync(new URL("./legacy-discord-cleanup-preflight.mjs", import.meta.url), "utf8");
const dashboardMigration = readFileSync(new URL("../migrations/auth/0039_retire_discord_poll_telemetry.sql", import.meta.url), "utf8");
const botMigration = readFileSync(new URL("../bot/migrations/0003_retire_legacy_alert_tables.sql", import.meta.url), "utf8");

const inputBlock = workflow.match(/    inputs:\n([\s\S]*?)\n\npermissions:/)?.[1];
assert.ok(inputBlock, "cleanup workflow must expose an explicit workflow_dispatch input block");
const inputNames = [...inputBlock.matchAll(/^      ([a-z0-9_]+):\s*$/gm)].map((match) => match[1]);
assert.equal(inputNames.length, 10, "GitHub workflow_dispatch allows at most ten top-level inputs");
assert.deepEqual(inputNames, [
  "confirm_target",
  "release_authorization",
  "candidate_commit",
  "expected_api_version",
  "expected_bot_version",
  "dashboard_backup_evidence",
  "bot_backup_evidence",
  "d1_release_evidence",
  "restore_rehearsal_run_url",
  "restore_rehearsal_commit",
]);

for (const binding of [
  "DASHBOARD_BACKUP_EVIDENCE: \${{ inputs.dashboard_backup_evidence }}",
  "BOT_BACKUP_EVIDENCE: \${{ inputs.bot_backup_evidence }}",
  "D1_RELEASE_EVIDENCE: \${{ inputs.d1_release_evidence }}",
]) {
  assert.ok(workflow.includes(binding), "workflow must pass compacted structured evidence to preflight: " + binding);
}
for (const key of [
  "dashboardBackupEvidence",
  "botBackupEvidence",
  "d1ReleaseEvidence",
  "env.BACKUP_REFERENCE = dashboardBackupEvidence.reference",
  "env.BOT_BACKUP_REFERENCE = botBackupEvidence.reference",
  "env.TIME_TRAVEL_BOOKMARK_REFERENCE = d1ReleaseEvidence.bookmark_reference",
  "env.D1_USAGE_CHECKED_AT = d1ReleaseEvidence.usage_checked_at",
]) {
  assert.ok(preflight.includes(key), "preflight must unpack and validate grouped evidence: " + key);
}
assert.ok(preflight.includes('"drive.google.com", "drive.usercontent.google.com"'),
  "encrypted backup preflight must accept both Drive viewer and binary-download hosts");

const dashboardDrops = [...dashboardMigration.matchAll(/DROP TABLE IF EXISTS ([a-z0-9_]+)/g)].map((match) => match[1]);
assert.deepEqual(dashboardDrops, ["discord_alert_poll_history", "discord_alert_poll_health"]);

const botDrops = [...botMigration.matchAll(/DROP TABLE IF EXISTS ([a-z0-9_]+)/g)].map((match) => match[1]);
assert.deepEqual(botDrops, [
  "alert_preferences",
  "alert_deliveries",
  "discord_alert_deliveries",
  "discord_alert_poll_escalations",
  "discord_alert_poll_state",
  "discord_alert_state",
]);

assert.match(workflow, /environment:\s*\n\s+name: production/);
assert.match(workflow, /node scripts\/legacy-discord-cleanup-preflight\.mjs/);
assert.match(workflow, /node scripts\/verify-legacy-discord-cleanup\.mjs/);
assert.ok(workflow.indexOf("Verify live Worker, backups, restore rehearsal and fresh D1 reserve before changes") <
  workflow.indexOf("Remove retired Discord poll telemetry from dashboard D1"));
assert.ok(workflow.indexOf("Remove retired Discord poll telemetry from dashboard D1") <
  workflow.indexOf("Remove retired alert and poll state from bot D1"));

console.log("PASS Discord cleanup workflow contract: ten dispatch inputs, grouped evidence, correct Drive hosts, exact dashboard and bot drop allowlists, and protected preflight-before-cleanup ordering.");
