import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import worker, { runDailySummaryDelivery } from "./production-worker.js";
import { commands } from "./command-schema.mjs";

const workerSource = readFileSync(new URL("./production-worker.js", import.meta.url), "utf8");
const wrangler = readFileSync(new URL("./wrangler.production.toml", import.meta.url), "utf8");
const register = readFileSync(new URL("./register-commands.mjs", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/components/floor/alerts-panel.tsx", import.meta.url), "utf8");
const apiWorker = readFileSync(new URL("../src/worker/index.ts", import.meta.url), "utf8");
const botSchema = readFileSync(new URL("./migrations/0001_bot_schema.sql", import.meta.url), "utf8");


test("health is summary-only and unsigned requests are rejected", async () => {
  const health = await worker.fetch(new Request("https://bot.example/health"), {});
  assert.equal(health.status, 200);
  const payload = await health.json();
  assert.equal(payload.privateDailySummary, true);
  assert.equal("privateAlertDelivery" in payload, false);
  const invalid = await worker.fetch(new Request("https://bot.example/interactions", { method: "POST", body: "{}" }), { DISCORD_PUBLIC_KEY: "11".repeat(32) }, { waitUntil() {} });
  assert.equal(invalid.status, 401);
});

test("the only onboarding commands reply privately and link-code opens the redemption modal", async () => {
  const keyPair = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKey = Buffer.from(await webcrypto.subtle.exportKey("raw", keyPair.publicKey)).toString("hex");
  const timestamp = String(Math.floor(Date.now() / 1000));
  async function send(data, context = 0, type = 2) {
    const body = JSON.stringify({ type, context, application_id: "app-id", token: "interaction-token", user: { id: "123456789012345678" }, data });
    const signature = Buffer.from(await webcrypto.subtle.sign("Ed25519", keyPair.privateKey, new TextEncoder().encode(timestamp + body))).toString("hex");
    return worker.fetch(new Request("https://bot.example/interactions", { method: "POST", headers: { "content-type": "application/json", "x-signature-ed25519": signature, "x-signature-timestamp": timestamp }, body }), { DISCORD_PUBLIC_KEY: publicKey }, { waitUntil() {} });
  }
  const link = await send({ name: "link" });
  assert.equal(link.status, 200);
  const linkReply = await link.json();
  assert.equal(linkReply.type, 4);
  assert.equal(linkReply.data.flags, 64);
  assert.match(linkReply.data.content, /generate a one-time Discord link code/i);
  assert.match(linkReply.data.content, /\/link-code/);

  const dmLink = await send({ name: "link" }, 1);
  const dmLinkReply = await dmLink.json();
  assert.equal(dmLinkReply.type, 4);
  assert.equal("flags" in dmLinkReply.data, false, "BOT_DM replies must not request the guild-only ephemeral flag");
  assert.match(dmLinkReply.data.content, /integration_type=1.*scope=applications.commands/);

  const dmStatus = await send({ name: "status" }, 1);
  const dmStatusAck = await dmStatus.json();
  assert.equal(dmStatusAck.type, 5);
  assert.deepEqual(dmStatusAck.data, {}, "deferred BOT_DM replies must omit ephemeral flags");

  const redeem = await send({ name: "link-code" }, 1);
  assert.equal(redeem.status, 200);
  const modal = await redeem.json();
  assert.equal(modal.type, 9);
  assert.equal(modal.data.custom_id, "link_code_submit");
  assert.equal(modal.data.components[0].component.custom_id, "link_code");
  assert.equal(modal.data.components[0].component.min_length, 48);
  assert.equal(modal.data.components[0].component.max_length, 48);
});

test("only four private-summary account-linking slash commands remain and are user-install BOT_DM only", () => {
  assert.deepEqual(commands.map(command => command.name), ["link", "link-code", "status", "unlink"]);
  for (const command of commands) {
    assert.deepEqual(command.integration_types, [1]);
    assert.deepEqual(command.contexts, [1]);
  }
});

test("scheduled Worker keeps the daily private summary and drops legacy poll/alert routes", () => {
  for (const required of ["runDailySummaryDelivery", "deliverDailyCompanySummary", "buildDailySummaryMessage", "isDailySummaryDue", "isDuringQuietHours", "alertsEnabled", "discord_daily_summary_deliveries", "discord_daily_company_summary_history"]) {
    assert.ok(workerSource.includes(required), `retained daily-summary contract must include ${required}`);
  }
  for (const removed of ["pollPrivateAlerts", "discord_alert_poll_state", "discord_alert_poll_escalations", "alert_preferences", "/api/me/alerts", "/api/me/discord-alert-poll-health", "renderDashboardPanel"]) {
    assert.equal(workerSource.includes(removed), false, `legacy bot surface must not include ${removed}`);
  }
});

test("daily delivery is hourly after :20 UTC and has no pre-window D1 access", async () => {
  assert.match(wrangler, /crons\s*=\s*\["20 \* \* \* \*"\]/);
  assert.doesNotMatch(wrangler, /DASHBOARD_PANEL_ENABLED/);
  const { runDailySummaryDelivery } = await import("./production-worker.js");
  const env = Object.defineProperty({}, "BOT_DB", { get() { throw new Error("D1 must not be touched before 18:20 UTC"); } });
  const early = await runDailySummaryDelivery(env, new Date("2026-10-20T18:19:59.000Z"));
  assert.equal(early.skipped, "before_summary_window");
});

test("guild sync deletes all retired bot roots and protects unrelated integrations", () => {
  for (const rootName of ["company", "automation", "dashboard", "bot", "help", "ping", "overview", "employees", "trends", "alerts", "rankings"]) {
    assert.ok(register.includes('"' + rootName + '"'), `retired command /${rootName} must be on the cleanup list`);
  }
  assert.match(register, /stale\.type !== undefined && stale\.type !== 1/);
});


test("the hourly runner checks the linked-account opt-in before queuing or sending a DM", async () => {
  const keyHex = "11".repeat(32);
  const key = await webcrypto.subtle.importKey("raw", Buffer.from(keyHex, "hex"), "AES-GCM", false, ["encrypt"]);
  const iv = new Uint8Array(12).fill(7);
  const cipher = Buffer.from(await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("dashboard-session"))).toString("hex");
  const statements = [];
  const db = { prepare(sql) { const query = { sql, values: [], bind(...values) { this.values = values; return this; }, async all() { return { results: [{ discordUserId: "123456789012345678", cipher, iv: Buffer.from(iv).toString("hex") }] }; }, async run() { statements.push({ sql, values: this.values }); return { meta: { changes: 1 } }; } }; return query; } };
  const dashboardCalls = [];
  const env = {
    BOT_DB: db, BOT_ENCRYPTION_KEY: keyHex, DISCORD_TOKEN: "test-bot-token",
    DASHBOARD_API: { async fetch(request) {
      const path = new URL(request.url).pathname;
      dashboardCalls.push(path);
      return new Response(JSON.stringify({ linked: true, alertsEnabled: false }), { status: 200, headers: { "content-type": "application/json" } });
    } }
  };
  let discordCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { discordCalls += 1; throw new Error("DM must not be sent while opt-in is off"); };
  try {
    const result = await runDailySummaryDelivery(env, new Date("2026-10-20T18:20:00.000Z"));
    assert.equal(result.scanned, 1);
    assert.equal(result.skipped, 1);
    assert.equal(result.delivered, 0);
    assert.deepEqual(dashboardCalls, ["/api/me/discord-link"]);
    assert.equal(statements.length, 0);
    assert.equal(discordCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("quiet hours queue the opted-in report without consuming a delivery attempt", async () => {
  const keyHex = "22".repeat(32);
  const key = await webcrypto.subtle.importKey("raw", Buffer.from(keyHex, "hex"), "AES-GCM", false, ["encrypt"]);
  const iv = new Uint8Array(12).fill(8);
  const cipher = Buffer.from(await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("dashboard-session"))).toString("hex");
  const statements = [];
  const db = { prepare(sql) { const query = { sql, values: [], bind(...values) { this.values = values; return this; }, async all() { return { results: [{ discordUserId: "123456789012345678", cipher, iv: Buffer.from(iv).toString("hex") }] }; }, async run() { statements.push({ sql, values: this.values }); return { meta: { changes: 1 } }; } }; return query; } };
  const env = {
    BOT_DB: db, BOT_ENCRYPTION_KEY: keyHex, DISCORD_TOKEN: "test-bot-token",
    DASHBOARD_API: { async fetch(request) {
      const path = new URL(request.url).pathname;
      const payload = path === "/api/me/discord-link"
        ? { linked: true, alertsEnabled: true }
        : { preferences: { quietHoursEnabled: true, quietHoursStart: "18:00", quietHoursEnd: "08:00", timezone: "UTC" } };
      return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
    } }
  };
  let discordCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { discordCalls += 1; throw new Error("DM must be deferred during quiet hours"); };
  try {
    const result = await runDailySummaryDelivery(env, new Date("2026-10-20T18:20:00.000Z"));
    assert.equal(result.skipped, 1);
    assert.equal(discordCalls, 0);
    assert.equal(statements.length, 1);
    assert.match(statements[0].sql, /INSERT INTO discord_daily_summary_deliveries/);
    assert.equal(statements[0].values[1], "2026-10-20");
  } finally { globalThis.fetch = originalFetch; }
});


test("an opted-in account receives exactly one private daily-summary DM and is marked delivered", async () => {
  const keyHex = "33".repeat(32);
  const key = await webcrypto.subtle.importKey("raw", Buffer.from(keyHex, "hex"), "AES-GCM", false, ["encrypt"]);
  const iv = new Uint8Array(12).fill(9);
  const cipher = Buffer.from(await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("dashboard-session"))).toString("hex");
  const statements = [];
  const db = { prepare(sql) { const query = { sql, values: [], bind(...values) { this.values = values; return this; }, async all() {
    if (sql.includes("FROM discord_links")) return { results: [{ discordUserId: "123456789012345678", cipher, iv: Buffer.from(iv).toString("hex") }] };
    if (sql.includes("FROM discord_daily_summary_deliveries") && sql.includes("reporting_day AS reportingDay")) return { results: [{ reportingDay: "2026-10-20" }] };
    return { results: [] };
  }, async first() {
    if (sql.includes("SELECT attempts FROM discord_daily_summary_deliveries")) return { attempts: 1 };
    return null;
  }, async run() { statements.push({ sql, values: this.values }); return { meta: { changes: 1 } }; } }; return query; } };
  const dashboardCalls = [];
  const env = {
    BOT_DB: db, BOT_ENCRYPTION_KEY: keyHex, DISCORD_TOKEN: "test-bot-token",
    DASHBOARD_API: { async fetch(request) {
      const path = new URL(request.url).pathname;
      dashboardCalls.push(path);
      const payload = path === "/api/me/discord-link" ? { linked: true, alertsEnabled: true }
        : path === "/api/me/automation-preferences" ? { preferences: { quietHoursEnabled: false } }
        : path === "/api/me/companies" ? { companies: [] }
        : path === "/api/rankings" ? { companies: [] } : {};
      return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
    } }
  };
  const discordCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    discordCalls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : null });
    if (String(url).endsWith("/users/@me/channels")) return new Response(JSON.stringify({ id: "private-channel" }), { status: 200, headers: { "content-type": "application/json" } });
    if (String(url).endsWith("/channels/private-channel/messages")) return new Response(JSON.stringify({ id: "private-message" }), { status: 200, headers: { "content-type": "application/json" } });
    throw new Error("Unexpected Discord request");
  };
  try {
    const result = await runDailySummaryDelivery(env, new Date("2026-10-20T18:20:00.000Z"));
    assert.equal(result.delivered, 1);
    assert.equal(result.failed, 0);
    assert.deepEqual(discordCalls.map(call => call.url), [
      "https://discord.com/api/v10/users/@me/channels",
      "https://discord.com/api/v10/channels/private-channel/messages"
    ]);
    assert.match(discordCalls[1].body.content, /DAILY COMPANY SUMMARY/);
    assert.equal(discordCalls[1].body.allowed_mentions.parse.length, 0);
    assert.ok(statements.some(item => /SET status='delivered'/.test(item.sql)));
    assert.deepEqual(dashboardCalls, ["/api/me/discord-link", "/api/me/automation-preferences", "/api/me/companies", "/api/rankings"]);
  } finally { globalThis.fetch = originalFetch; }
});

test("dashboard API no longer exposes or writes the removed poll-health telemetry", () => {
  for (const retired of ["discord-alert-poll-health", "discordPollHealthPath", "discord_alert_poll_health", "discord_alert_poll_history"]) {
    assert.equal(apiWorker.includes(retired), false, `API Worker must not include ${retired}`);
  }
  for (const retained of ["/api/me/discord-link", "/api/me/discord-link-code", "/api/discord/link/redeem", "alerts_enabled"]) {
    assert.ok(apiWorker.includes(retained), `private daily-summary account consent must retain ${retained}`);
  }
  for (const table of ["discord_links", "discord_daily_summary_deliveries", "discord_daily_company_summary_state"]) {
    assert.match(botSchema, new RegExp("CREATE TABLE IF NOT EXISTS " + table));
  }
  assert.doesNotMatch(botSchema, /CREATE TABLE IF NOT EXISTS (alert_preferences|discord_alert_poll_state|discord_alert_poll_escalations)/);
});

test("Automation Center no longer polls old alert-health telemetry", () => {
  assert.match(ui, /Private DM daily summary/);
  assert.match(ui, /Enable private daily summary/);
  assert.doesNotMatch(ui, /discord-poll-monitor|discord-alert-poll-health|evaluateDiscordPollHealth|refreshDiscordPollMonitoring/);
});
