import assert from "node:assert/strict";
import { commands } from "./command-schema.mjs";
import { registerCommands } from "./register-commands.mjs";

const globalBase = "https://discord.com/api/v10/applications/test-app/commands";
const guildBase = "https://discord.com/api/v10/applications/test-app/guilds/test-guild/commands";
const response = (payload, status = 200, headers = {}) => new Response(payload === null ? null : JSON.stringify(payload), {
  status,
  headers: { "content-type": "application/json", ...headers }
});

function makeHarness({ rateLimitFirstPatch = false, alwaysRateLimit = false } = {}) {
  const initialGlobal = [
    { id: "global-link", type: 1, ...structuredClone(commands[0]) },
    { id: "legacy-global-company", type: 1, name: "company", description: "Old global company command" },
    { id: "foreign-weather", type: 1, name: "weather", description: "Owned by another integration" },
    { id: "foreign-context", type: 2, name: "company" }
  ];
  const initialGuild = [
    ...commands.map(command => ({ id: "guild-" + command.name, type: 1, ...structuredClone(command) })),
    { id: "legacy-company", type: 1, name: "company", description: "Old company commands" },
    { id: "legacy-automation", type: 1, name: "automation", description: "Old automation commands" },
    { id: "legacy-flat", type: 1, name: "company-rankings-global", description: "Old flat command" },
    { id: "foreign-weather-guild", type: 1, name: "weather", description: "Another integration" },
    { id: "foreign-context-guild", type: 2, name: "company" }
  ];
  let globalCommands = structuredClone(initialGlobal);
  let guildCommands = structuredClone(initialGuild);
  const calls = [];
  const sleeps = [];
  const warnings = [];
  const logs = [];
  let globalGets = 0;
  let guildGets = 0;
  let createdId = 0;
  let limitedFirstPatch = false;

  const fetchImpl = async (url, init = {}) => {
    const method = init.method || "GET";
    const endpoint = String(url);
    const call = { url: endpoint, method, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);

    if (method === "GET" && endpoint === globalBase) {
      globalGets += 1;
      return response(globalGets === 1 ? initialGlobal : globalCommands);
    }
    if (method === "GET" && endpoint === guildBase) {
      guildGets += 1;
      return response(guildGets === 1 ? initialGuild : guildCommands);
    }

    const isGlobalPatch = method === "PATCH" && endpoint.startsWith(globalBase + "/");
    const shouldLimit = isGlobalPatch && (alwaysRateLimit || (rateLimitFirstPatch && !limitedFirstPatch));
    if (shouldLimit) {
      limitedFirstPatch = true;
      return response({ message: "rate limited", retry_after: 1.5 }, 429, { "retry-after": "1.5" });
    }

    if (method === "PATCH" && endpoint.startsWith(globalBase + "/")) {
      const id = endpoint.split("/").at(-1);
      const index = globalCommands.findIndex(command => command.id === id);
      if (index < 0) return response({ message: "unknown global command" }, 404);
      globalCommands[index] = { ...call.body, id, type: call.body.type ?? 1 };
      return response(globalCommands[index]);
    }
    if (method === "POST" && endpoint === globalBase) {
      const created = { ...call.body, id: "created-" + (++createdId), type: call.body.type ?? 1 };
      globalCommands.push(created);
      return response(created, 201);
    }
    if (method === "DELETE" && endpoint.startsWith(globalBase + "/")) {
      const id = endpoint.split("/").at(-1);
      const index = globalCommands.findIndex(command => command.id === id);
      if (index < 0) return response({ message: "unknown global command" }, 404);
      return response(globalCommands.splice(index, 1)[0]);
    }
    if (method === "DELETE" && endpoint.startsWith(guildBase + "/")) {
      const id = endpoint.split("/").at(-1);
      const index = guildCommands.findIndex(command => command.id === id);
      if (index < 0) return response({ message: "unknown guild command" }, 404);
      return response(guildCommands.splice(index, 1)[0]);
    }
    return response({ message: "unexpected mock request", endpoint, method }, 500);
  };

  return {
    calls, sleeps, warnings, logs,
    get globalCommands() { return globalCommands; },
    get guildCommands() { return guildCommands; },
    fetchImpl,
    sleep: async milliseconds => { sleeps.push(milliseconds); },
    warn: message => warnings.push(message),
    log: message => logs.push(message)
  };
}

const scenario = makeHarness({ rateLimitFirstPatch: true });
const result = await registerCommands({
  token: "  Bot test-token  ", appId: "test-app", guildId: "test-guild",
  fetchImpl: scenario.fetchImpl, sleep: scenario.sleep, warn: scenario.warn, log: scenario.log
});
assert.deepEqual(result, { checkToken: false, registeredCount: commands.length });
assert.deepEqual(scenario.calls.slice(0, 2).map(call => [call.url, call.method]), [
  [globalBase, "GET"], [guildBase, "GET"]
], "the sync must inspect global and legacy guild command sets first");
assert.equal(scenario.sleeps.length, 1);
assert.equal(scenario.sleeps[0], 1750);
assert.equal(scenario.warnings.length, 1);
assert.equal(scenario.calls.filter(call => call.method === "PATCH" && call.url.startsWith(globalBase + "/")).length, 2);
assert.equal(scenario.calls.filter(call => call.method === "POST" && call.url === globalBase).length, commands.length - 1);

for (const command of scenario.globalCommands.filter(item => commands.some(owned => owned.name === item.name))) {
  assert.deepEqual(command.integration_types, [1], "each owned global command is user-install only");
  assert.deepEqual(command.contexts, [1], "each owned global command is available in bot DMs only");
}
assert.equal(scenario.globalCommands.some(item => item.id === "legacy-global-company"), false);
assert.equal(scenario.globalCommands.some(item => item.id === "foreign-weather"), true);
assert.equal(scenario.globalCommands.some(item => item.id === "foreign-context"), true);

const deletedGuildIds = scenario.calls.filter(call => call.method === "DELETE" && call.url.startsWith(guildBase + "/")).map(call => call.url.split("/").at(-1));
assert.deepEqual(new Set(deletedGuildIds), new Set([
  "guild-link", "guild-link-code", "guild-status", "guild-unlink",
  "legacy-company", "legacy-automation", "legacy-flat"
]));
assert.equal(scenario.guildCommands.some(command => command.id === "foreign-weather-guild"), true);
assert.equal(scenario.guildCommands.some(command => command.id === "foreign-context-guild"), true);
assert.equal(scenario.guildCommands.some(command => command.type === 1 && commands.some(owned => owned.name === command.name)), false);
assert.ok(scenario.logs.some(line => line.includes("USER_INSTALL commands restricted to BOT_DM")));

const checkToken = makeHarness();
const tokenResult = await registerCommands({
  token: "test-token", appId: "test-app", guildId: "test-guild",
  fetchImpl: checkToken.fetchImpl, sleep: checkToken.sleep, warn: checkToken.warn, log: checkToken.log, checkToken: true
});
assert.equal(tokenResult.checkToken, true);
assert.equal(checkToken.calls.length, 2, "token validation must only read global and legacy guild endpoints");
assert.ok(checkToken.calls.every(call => call.method === "GET"));

const exhausted = makeHarness({ alwaysRateLimit: true });
await assert.rejects(registerCommands({
  token: "test-token", appId: "test-app", guildId: "test-guild",
  fetchImpl: exhausted.fetchImpl, sleep: exhausted.sleep, warn: exhausted.warn, log: exhausted.log
}), /Discord API PATCH 429/);
assert.equal(exhausted.calls.filter(call => call.method === "PATCH").length, 9);
assert.equal(exhausted.sleeps.length, 8);
assert.equal(exhausted.calls.filter(call => call.method === "POST" || call.method === "DELETE").length, 0);

await assert.rejects(registerCommands({
  token: "", appId: "test-app", guildId: "test-guild",
  fetchImpl: async () => { throw new Error("network should not be called"); }
}), /Missing DISCORD_TOKEN/);

console.log("PASS global Discord command registration tests: USER_INSTALL/BOT_DM metadata, bounded 429 retry, legacy guild cleanup, unrelated command preservation, and read-only token check.");
