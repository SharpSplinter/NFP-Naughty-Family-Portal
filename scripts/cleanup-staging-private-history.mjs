import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertFixtureIdentityOutput, buildFixtureCleanupStatements,
  parseWranglerD1Metrics, recordWranglerD1Metrics, sqlQuote,
  STAGING_FIXTURE_IDENTITIES,
} from "./staging-private-history-fixtures.mjs";

const CONFIG = "wrangler.acceptance.toml";
const DATABASE = "naughtyfamily-acceptance-staging";
const ACCOUNT_ID = "6c03b978ed9a59adc3f61c715bdad45c";
if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error("CLOUDFLARE_API_TOKEN is required for staging fixture cleanup.");
if (process.env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT_ID) throw new Error("Refusing cleanup outside the reviewed Cloudflare account.");
const config = readFileSync(CONFIG, "utf8");
if (!config.includes('name = "naughtyfamily-api-staging"') ||
    !config.includes('database_name = "naughtyfamily-acceptance-staging"') ||
    !config.includes('database_id = "02cca699-1232-495f-8a0a-de525058b92a"') ||
    config.includes("bbbe128a-c5cc-46ec-b8ef-93860183e795")) {
  throw new Error("Refusing cleanup because the config no longer matches the isolated acceptance D1.");
}

// Always-run cleanup is guarded by the same ID/name ownership check as seeding.
const identitySql = "SELECT player_id, player_name FROM players WHERE player_id IN (" +
  STAGING_FIXTURE_IDENTITIES.map(row => sqlQuote(row.playerId)).join(", ") + ");";
const identityOutput = execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", [
  "wrangler", "d1", "execute", DATABASE, "--remote", "--config", CONFIG,
  "--command", identitySql, "--json",
], { encoding: "utf8", env: process.env, maxBuffer: 4 * 1024 * 1024 });
assertFixtureIdentityOutput(identityOutput);
recordWranglerD1Metrics(parseWranglerD1Metrics(identityOutput), "cleanup identity preflight", 100);

const sql = buildFixtureCleanupStatements({
  createdAt: process.env.STAGING_FIXTURE_CREATED_AT || null,
  discordLinkCode: process.env.STAGING_DISCORD_LINK_CODE || null,
  deactivatePlayers: true,
}).join("\n") + "\n";
const tempDir = mkdtempSync(join(tmpdir(), "ncd-private-history-cleanup-"));
const sqlPath = join(tempDir, "cleanup-private-history.sql");
try {
  writeFileSync(sqlPath, sql, "utf8");
  let output;
  try {
    output = execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", [
      "wrangler", "d1", "execute", DATABASE, "--remote", "--config", CONFIG, "--file", sqlPath,
    ], { encoding: "utf8", env: process.env, maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    if (error.stdout) process.stdout.write(String(error.stdout));
    if (error.stderr) process.stderr.write(String(error.stderr));
    throw error;
  }
  process.stdout.write(output);
  recordWranglerD1Metrics(parseWranglerD1Metrics(output), "synthetic fixture cleanup");
  console.log("PASS fixture-owned records removed. Reserved player IDs remain inactive, with credentials/sessions/archive rows cleared and faction membership unset.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
