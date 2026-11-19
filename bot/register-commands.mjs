import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { commands } from "./command-schema.mjs";
import { commandSchemaDifferences } from "./command-schema-contract.mjs";

const APP_ID = process.env.DISCORD_APP_ID || "1558700958983389254";
const GUILD_ID = process.env.DISCORD_GUILD_ID || "1525623497999515770";
const CANONICAL_ROOTS = new Set(commands.map(command => command.name));
const DEPRECATED_ROOT_ALIASES = new Set(["overview", "employees", "trends", "alerts", "rankings", "company", "automation", "dashboard", "bot", "help", "ping"]);
const LEGACY_FLAT_ROOT_ALIASES = new Set([
  "bot-status", "dashboard-health", "dashboard-summary",
  "automation-rules-list", "automation-rules-create", "automation-rules-enable", "automation-rules-disable",
  "automation-rules-delete", "automation-notifications-status", "automation-notifications-configure",
  "automation-webhook-status", "automation-webhook-deliveries", "automation-webhook-retry", "automation-webhook-delete",
  "company-list", "company-overview", "company-income", "company-profit", "company-stars", "company-ads",
  "company-stock", "company-employees", "company-wages", "company-trends", "company-alerts",
  "company-alerts-recent", "company-alerts-enable", "company-alerts-disable", "company-alerts-configure",
  "company-alerts-status", "company-alerts-settings", "company-alerts-acknowledge", "company-alerts-rules",
  "company-rankings", "company-rankings-companies", "company-rankings-company", "company-rankings-compare",
  "company-rankings-global", "company-rankings-faction"
]);

function isLegacyFlatRootName(name) {
  return typeof name === "string" &&
    (LEGACY_FLAT_ROOT_ALIASES.has(name) || /^(?:company|automation|dashboard|bot)[-_]/.test(name));
}
function isOwnedOrRetiredChatInput(command) {
  return command && (command.type === undefined || command.type === 1) &&
    (CANONICAL_ROOTS.has(command.name) || DEPRECATED_ROOT_ALIASES.has(command.name) || isLegacyFlatRootName(command.name));
}

/**
 * Sync the four account commands as global user-installed commands, usable in
 * the bot's DM only. After the global upsert succeeds, remove this bot's old
 * guild-scoped roots so users no longer need a server channel.
 */
export async function registerCommands({
  token = process.env.DISCORD_TOKEN || "",
  appId = APP_ID,
  guildId = GUILD_ID,
  fetchImpl = globalThis.fetch,
  sleep = milliseconds => new Promise(resolveSleep => setTimeout(resolveSleep, milliseconds)),
  log = message => console.log(message),
  warn = message => console.warn(message),
  checkToken = false
} = {}) {
  const normalizedToken = String(token).trim().replace(/^Bot\\s+/i, "").trim();
  if (!normalizedToken) {
    throw new Error("Missing DISCORD_TOKEN in GitHub Actions secrets. Add it as a repository Actions secret; the Cloudflare Worker secret is not automatically available to GitHub Actions.");
  }
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");

  const globalBase = "https://discord.com/api/v10/applications/" + appId + "/commands";
  const guildBase = "https://discord.com/api/v10/applications/" + appId + "/guilds/" + guildId + "/commands";
  const headers = {
    authorization: "Bot " + normalizedToken,
    "content-type": "application/json",
    "user-agent": "NaughtyCompanyDashboardCommandSync/2.0"
  };

  async function request(url, method, body) {
    const maxRateLimitRetries = 8;
    for (let attempt = 0; attempt <= maxRateLimitRetries; attempt += 1) {
      const response = await fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const responseText = await response.text();
      let data;
      try { data = responseText ? JSON.parse(responseText) : null; } catch { data = responseText; }
      if (response.status === 429 && attempt < maxRateLimitRetries) {
        const retryAfter = Number(data && typeof data === "object" ? data.retry_after : undefined) ||
          Number(response.headers.get("retry-after")) || 1;
        const delayMs = Math.max(250, Math.ceil((retryAfter + 0.25) * 1000));
        warn("Discord rate limited command sync; retrying after " + (delayMs / 1000).toFixed(2) + " seconds.");
        await sleep(delayMs);
        continue;
      }
      if (!response.ok) {
        throw new Error("Discord API " + method + " " + response.status + ": " + JSON.stringify(data).slice(0, 1000));
      }
      return data;
    }
    throw new Error("Discord command sync exceeded its rate-limit retry budget.");
  }

  const [existingGlobal, existingGuild] = await Promise.all([
    request(globalBase, "GET"),
    request(guildBase, "GET")
  ]);
  if (!Array.isArray(existingGlobal) || !Array.isArray(existingGuild)) {
    throw new Error("Discord returned an unexpected application-command list.");
  }
  if (checkToken) {
    log("Discord token is valid for application " + appId + "; global and legacy guild command endpoints are accessible.");
    return { checkToken: true, registeredCount: existingGlobal.length };
  }

  for (const command of commands) {
    const current = existingGlobal.find(item => item.name === command.name && (item.type === undefined || item.type === 1));
    if (current?.id) {
      await request(globalBase + "/" + current.id, "PATCH", command);
      log("Updated global DM command /" + command.name);
    } else {
      await request(globalBase, "POST", command);
      log("Created global DM command /" + command.name);
    }
  }

  for (const stale of existingGlobal) {
    if (!stale?.id || (stale.type !== undefined && stale.type !== 1)) continue;
    if (!DEPRECATED_ROOT_ALIASES.has(stale.name) && !isLegacyFlatRootName(stale.name)) continue;
    await request(globalBase + "/" + stale.id, "DELETE");
    log("Removed obsolete global command /" + stale.name);
  }

  // Keep these four account commands out of guild-channel command scope.
  // Unrelated slash commands and all context-menu commands are deliberately preserved.
  for (const stale of existingGuild) {
    if (!stale?.id || !isOwnedOrRetiredChatInput(stale)) continue;
    await request(guildBase + "/" + stale.id, "DELETE");
    log("Removed legacy guild command /" + stale.name);
  }

  const [registeredGlobal, registeredGuild] = await Promise.all([
    request(globalBase, "GET"),
    request(guildBase, "GET")
  ]);
  if (!Array.isArray(registeredGlobal) || !Array.isArray(registeredGuild)) {
    throw new Error("Discord returned an unexpected command list after registration.");
  }

  const missingOrMismatched = [];
  for (const command of commands) {
    const registeredCommand = registeredGlobal.find(item =>
      item.name === command.name && (item.type === undefined || item.type === 1));
    if (!registeredCommand) {
      missingOrMismatched.push("/" + command.name + " (missing)");
      continue;
    }
    const schemaDifferences = commandSchemaDifferences(command, registeredCommand);
    if (schemaDifferences.length) {
      const shown = schemaDifferences.slice(0, 5).join(", ");
      const remainder = schemaDifferences.length > 5 ? ", +" + (schemaDifferences.length - 5) + " more" : "";
      missingOrMismatched.push("/" + command.name + " (schema differs: " + shown + remainder + ")");
    }
  }
  if (missingOrMismatched.length) {
    throw new Error("Discord global command verification failed: " + missingOrMismatched.join(", "));
  }

  const remainingGlobalAliases = registeredGlobal.filter(item =>
    (item.type === undefined || item.type === 1) &&
    (DEPRECATED_ROOT_ALIASES.has(item.name) || isLegacyFlatRootName(item.name)));
  if (remainingGlobalAliases.length) {
    throw new Error("Obsolete global command roots remain registered: " + remainingGlobalAliases.map(item => "/" + item.name).join(", "));
  }
  const remainingGuildBotRoots = registeredGuild.filter(isOwnedOrRetiredChatInput);
  if (remainingGuildBotRoots.length) {
    throw new Error("Legacy guild command roots remain registered: " + remainingGuildBotRoots.map(item => "/" + item.name).join(", "));
  }

  log("Verified four global USER_INSTALL commands restricted to BOT_DM.");
  log("Verified legacy guild bot commands are removed; unrelated integrations and context-menu commands were preserved.");
  return { checkToken: false, registeredCount: commands.length };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    await registerCommands({ checkToken: process.argv.includes("--check-token") });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Command registration failed.");
    process.exitCode = 1;
  }
}
