import { isDailySummaryDue, previousReportingDay, reportingDayAt, summaryMetricValues, buildDailySummaryMessage, isDuringQuietHours } from "./daily-summary.mjs";

const enc = new TextEncoder();
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const privateReply = content => ({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } });
const hexBytes = value => Uint8Array.from((String(value).match(/.{2}/g) || []), item => parseInt(item, 16));

function isTimeoutError(error) {
  return error?.name === "TimeoutError" || error?.name === "AbortError";
}
function timeoutWithCode(error, code) {
  if (!code || !isTimeoutError(error)) return error;
  return Object.assign(new Error(code), { code });
}
function dashboardHttpError(stage, response) {
  return Object.assign(new Error(stage + "_http_" + response.status), { code: stage + "_http_" + response.status });
}
async function dashboardFetch(env, path, init = {}, timeoutCode = null) {
  if (!env.DASHBOARD_API) throw new Error("dashboard_binding_missing");
  try {
    return await env.DASHBOARD_API.fetch(new Request("https://naughtyfamily-api" + path, init));
  } catch (error) { throw timeoutWithCode(error, timeoutCode); }
}
async function dashboardJson(response, timeoutCode) {
  try { return await response.json(); }
  catch (error) { throw timeoutWithCode(error, timeoutCode); }
}
async function signed(request, env) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!signature || !timestamp || !/^[0-9a-f]{128}$/i.test(signature) || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  if (!/^[0-9a-f]{64}$/i.test(env.DISCORD_PUBLIC_KEY || "")) return false;
  try {
    const publicKey = await crypto.subtle.importKey("raw", hexBytes(env.DISCORD_PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", publicKey, hexBytes(signature), enc.encode(timestamp + await request.clone().text()));
  } catch { return false; }
}
async function encryptionKey(env) {
  if (!/^[0-9a-f]{64}$/i.test(env.BOT_ENCRYPTION_KEY || "")) throw new Error("bot_encryption_not_configured");
  return crypto.subtle.importKey("raw", hexBytes(env.BOT_ENCRYPTION_KEY), "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(value, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(env), enc.encode(value)));
  return { cipher: [...ciphertext].map(byte => byte.toString(16).padStart(2, "0")).join(""), iv: [...iv].map(byte => byte.toString(16).padStart(2, "0")).join("") };
}
async function unseal(ciphertext, iv, env) {
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: hexBytes(iv) }, await encryptionKey(env), hexBytes(ciphertext)));
}

async function ensureBotSchema(env) {
  const statements = [
    "CREATE TABLE IF NOT EXISTS discord_links (discord_user_id TEXT PRIMARY KEY, dashboard_player_id TEXT NOT NULL, encrypted_session_token TEXT NOT NULL, token_iv TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS discord_daily_summary_deliveries (discord_user_id TEXT NOT NULL, reporting_day TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY(discord_user_id,reporting_day))",
    "CREATE TABLE IF NOT EXISTS discord_daily_company_summary_state (discord_user_id TEXT NOT NULL, company_id TEXT NOT NULL, snapshot_day TEXT NOT NULL, metrics_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(discord_user_id,company_id))",
    "CREATE TABLE IF NOT EXISTS discord_daily_company_summary_history (discord_user_id TEXT NOT NULL, company_id TEXT NOT NULL, snapshot_day TEXT NOT NULL, metrics_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(discord_user_id,company_id,snapshot_day))"
  ];
  for (const statement of statements) await env.BOT_DB.prepare(statement).run();
}
async function storeBotLink(discordUserId, playerId, token, env) {
  const encrypted = await seal(token, env);
  const now = new Date().toISOString();
  await env.BOT_DB.prepare("INSERT INTO discord_links(discord_user_id,dashboard_player_id,encrypted_session_token,token_iv,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(discord_user_id) DO UPDATE SET dashboard_player_id=excluded.dashboard_player_id,encrypted_session_token=excluded.encrypted_session_token,token_iv=excluded.token_iv,updated_at=excluded.updated_at")
    .bind(discordUserId, playerId, encrypted.cipher, encrypted.iv, now).run();
}
async function sendPrivateDiscordMessage(env, discordUserId, content) {
  if (!env.DISCORD_TOKEN) return false;
  const headers = { authorization: "Bot " + env.DISCORD_TOKEN, "content-type": "application/json", "user-agent": "NaughtyCompanyDashboardBot/1.0" };
  const channelResponse = await fetch("https://discord.com/api/v10/users/@me/channels", { method: "POST", headers, body: JSON.stringify({ recipient_id: discordUserId }) });
  if (!channelResponse.ok) return false;
  const channel = await channelResponse.json();
  if (!channel?.id) return false;
  const messageResponse = await fetch("https://discord.com/api/v10/channels/" + encodeURIComponent(channel.id) + "/messages", {
    method: "POST", headers,
    body: JSON.stringify({ content: String(content).slice(0, 1900), allowed_mentions: { parse: [] } })
  });
  return messageResponse.ok;
}

async function loadDailyCompanySummary(env, headers, discordUserId, reportingDay) {
  const previousDay = previousReportingDay(reportingDay);
  const companiesResponse = await dashboardFetch(env, "/api/me/companies", { headers, signal: AbortSignal.timeout(8000) }, "dashboard_companies_timeout");
  if (!companiesResponse.ok) throw dashboardHttpError("dashboard_companies", companiesResponse);
  const companiesPayload = await dashboardJson(companiesResponse, "dashboard_companies_timeout");
  const companies = Array.isArray(companiesPayload.companies) ? companiesPayload.companies : [];

  let rankingRows = [];
  try {
    const rankingResponse = await dashboardFetch(env, "/api/rankings?scope=global", { headers, signal: AbortSignal.timeout(8000) }, "dashboard_rankings_timeout");
    if (rankingResponse.ok) {
      const rankingPayload = await dashboardJson(rankingResponse, "dashboard_rankings_timeout");
      rankingRows = Array.isArray(rankingPayload.companies) ? rankingPayload.companies : [];
    }
  } catch {
    // The rest of the summary remains useful when the shared ranking cache is unavailable.
  }

  const blocks = [];
  const statesToSave = [];
  for (const savedCompany of companies) {
    const companyId = String(savedCompany.company_id ?? savedCompany.companyId ?? "");
    if (!/^\d+$/.test(companyId) || Number(companyId) <= 0) continue;
    const historyResponse = await dashboardFetch(
      env,
      "/api/me/companies/" + encodeURIComponent(companyId) + "/history?days=7",
      { headers, signal: AbortSignal.timeout(8000) },
      "dashboard_company_history_timeout"
    );
    if (!historyResponse.ok) throw dashboardHttpError("dashboard_company_history", historyResponse);
    const historyPayload = await dashboardJson(historyResponse, "dashboard_company_history_timeout");
    const history = Array.isArray(historyPayload.history) ? historyPayload.history : [];
    const currentPoint = history.find(point => point && point.day === reportingDay) || null;
    const previousPoint = history.find(point => point && point.day === previousDay) || null;
    const latestPoint = history.length ? history[history.length - 1] : null;
    const [savedHistory, savedState] = await Promise.all([
      env.BOT_DB.prepare(
        "SELECT snapshot_day AS snapshotDay,metrics_json AS metricsJson FROM discord_daily_company_summary_history WHERE discord_user_id=? AND company_id=? AND snapshot_day=?"
      ).bind(discordUserId, companyId, previousDay).first(),
      env.BOT_DB.prepare(
        "SELECT snapshot_day AS snapshotDay,metrics_json AS metricsJson FROM discord_daily_company_summary_state WHERE discord_user_id=? AND company_id=?"
      ).bind(discordUserId, companyId).first()
    ]);
    let storedPrevious = null;
    const previousState = savedHistory && savedHistory.snapshotDay === previousDay
      ? savedHistory
      : savedState && savedState.snapshotDay === previousDay
        ? savedState
        : null;
    if (previousState && typeof previousState.metricsJson === "string") {
      try { storedPrevious = JSON.parse(previousState.metricsJson); } catch {}
    }

    const cachedSelf = rankingRows.find(row => String(row.companyId ?? row.company_id ?? "") === companyId);
    const companyMeta = {
      companyId,
      companyType: String(savedCompany.company_type ?? savedCompany.companyType ?? cachedSelf?.companyType ?? ""),
      companyTypeId: cachedSelf?.companyTypeId ?? cachedSelf?.company_type_id ?? cachedSelf?.typeId ?? null
    };
    const metrics = summaryMetricValues(currentPoint, rankingRows, companyMeta);
    let previousMetrics = summaryMetricValues(previousPoint, rankingRows, companyMeta);
    if (storedPrevious) {
      previousMetrics = {
        ...previousMetrics,
        companyRank: Number.isFinite(storedPrevious.companyRank) ? storedPrevious.companyRank : null,
        starIncomeGap: Number.isFinite(storedPrevious.starIncomeGap) ? storedPrevious.starIncomeGap : null
      };
    } else {
      previousMetrics = { ...previousMetrics, companyRank: null, starIncomeGap: null };
    }

    blocks.push({
      companyId,
      name: savedCompany.company_name ?? savedCompany.companyName ?? cachedSelf?.companyName ?? ("Company #" + companyId),
      snapshotDay: currentPoint?.day ?? latestPoint?.day ?? null,
      metrics,
      previousMetrics,
      previousDayAvailable: Boolean(previousPoint || storedPrevious)
    });
    if (currentPoint) statesToSave.push({
      companyId,
      metrics,
      updatedAt: new Date().toISOString()
    });
  }

  return {
    message: buildDailySummaryMessage({ reportingDay, companies: blocks }),
    companyCount: blocks.length,
    statesToSave
  };
}

async function deliverDailyCompanySummary(env, discordUserId, token, reportingDay, metrics) {
  const db = env.BOT_DB;
  const existing = await db.prepare(
    "SELECT status,attempts,updated_at AS updatedAt FROM discord_daily_summary_deliveries WHERE discord_user_id=? AND reporting_day=?"
  ).bind(discordUserId, reportingDay).first();
  if (existing?.status === "delivered") return "already_delivered";
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const claim = await db.prepare(
    "INSERT INTO discord_daily_summary_deliveries(discord_user_id,reporting_day,status,attempts,updated_at) VALUES(?,?,'processing',1,?) ON CONFLICT(discord_user_id,reporting_day) DO UPDATE SET status='processing',attempts=discord_daily_summary_deliveries.attempts+1,updated_at=excluded.updated_at WHERE discord_daily_summary_deliveries.status <> 'delivered' AND discord_daily_summary_deliveries.attempts < 3 AND (discord_daily_summary_deliveries.status <> 'processing' OR discord_daily_summary_deliveries.updated_at < ?)"
  ).bind(discordUserId, reportingDay, now, staleBefore).run();
  if (Number(claim?.meta?.changes || 0) !== 1) {
    const refreshed = await db.prepare(
      "SELECT status,attempts FROM discord_daily_summary_deliveries WHERE discord_user_id=? AND reporting_day=?"
    ).bind(discordUserId, reportingDay).first();
    if (refreshed?.status === "delivered") return "already_delivered";
    if (Number(refreshed?.attempts || 0) >= 3 && refreshed?.status !== "delivered") {
      metrics.failed += 1;
      metrics.exhausted += 1;
      return "exhausted";
    }
    return "in_progress";
  }
  const claimed = await db.prepare(
    "SELECT attempts FROM discord_daily_summary_deliveries WHERE discord_user_id=? AND reporting_day=?"
  ).bind(discordUserId, reportingDay).first();
  const attempts = Number(claimed?.attempts || 1);

  try {
    const headers = { authorization: "Bearer " + token, accept: "application/json" };
    const report = await loadDailyCompanySummary(env, headers, discordUserId, reportingDay);
    metrics.pages = 1;
    metrics.eventsSeen = report.companyCount;
    const delivered = await sendPrivateDiscordMessage(env, discordUserId, report.message);
    if (!delivered) {
      await db.prepare("UPDATE discord_daily_summary_deliveries SET status='failed',updated_at=? WHERE discord_user_id=? AND reporting_day=? AND status='processing' AND attempts=?")
        .bind(new Date().toISOString(), discordUserId, reportingDay, attempts).run();
      metrics.failed += 1;
      if (attempts >= 3) metrics.exhausted += 1;
      return "failed";
    }

    await db.prepare("UPDATE discord_daily_summary_deliveries SET status='delivered',updated_at=? WHERE discord_user_id=? AND reporting_day=? AND status='processing' AND attempts=?")
      .bind(new Date().toISOString(), discordUserId, reportingDay, attempts).run();
    for (const item of report.statesToSave) {
      const metricsJson = JSON.stringify(item.metrics);
      // Keep an immutable-per-day comparison record as well as the latest-value pointer.
      // A summary retry must not erase yesterday's rank/gap values before they are compared.
      await db.prepare(
        "INSERT INTO discord_daily_company_summary_history(discord_user_id,company_id,snapshot_day,metrics_json,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(discord_user_id,company_id,snapshot_day) DO UPDATE SET metrics_json=excluded.metrics_json,updated_at=excluded.updated_at"
      ).bind(discordUserId, item.companyId, reportingDay, metricsJson, item.updatedAt).run();
      await db.prepare(
        "INSERT INTO discord_daily_company_summary_state(discord_user_id,company_id,snapshot_day,metrics_json,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(discord_user_id,company_id) DO UPDATE SET snapshot_day=excluded.snapshot_day,metrics_json=excluded.metrics_json,updated_at=excluded.updated_at"
      ).bind(discordUserId, item.companyId, reportingDay, metricsJson, item.updatedAt).run();
    }
    metrics.delivered += 1;
    return "delivered";
  } catch (error) {
    await db.prepare("UPDATE discord_daily_summary_deliveries SET status='failed',updated_at=? WHERE discord_user_id=? AND reporting_day=? AND status='processing' AND attempts=?")
      .bind(new Date().toISOString(), discordUserId, reportingDay, attempts).run().catch(() => undefined);
    throw error;
  }
}

export async function runDailySummaryDelivery(env, value = new Date()) {
  const now = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(now.getTime()) || !isDailySummaryDue(now)) return { skipped: "before_summary_window", scanned: 0, delivered: 0, failed: 0 };
  if (!env.BOT_DB || !env.BOT_ENCRYPTION_KEY || !env.DISCORD_TOKEN || !env.DASHBOARD_API) return { skipped: "configuration_missing", scanned: 0, delivered: 0, failed: 0 };

  const reportingDay = reportingDayAt(now);
  const priorDay = previousReportingDay(reportingDay);
  const links = await env.BOT_DB.prepare(
    "SELECT discord_user_id AS discordUserId, encrypted_session_token AS cipher, token_iv AS iv FROM discord_links ORDER BY created_at ASC"
  ).all();
  const totals = { reportingDay, scanned: 0, delivered: 0, skipped: 0, failed: 0, exhausted: 0 };

  for (const link of links.results || []) {
    totals.scanned += 1;
    try {
      const token = await unseal(link.cipher, link.iv, env);
      const headers = { authorization: "Bearer " + token, accept: "application/json" };
      const linkResponse = await dashboardFetch(env, "/api/me/discord-link", { headers, signal: AbortSignal.timeout(8000) }, "dashboard_discord_link_timeout");
      if (!linkResponse.ok) throw dashboardHttpError("dashboard_discord_link", linkResponse);
      const linkState = await dashboardJson(linkResponse, "dashboard_discord_link_timeout");
      if (!linkState.linked || linkState.alertsEnabled !== true) { totals.skipped += 1; continue; }

      const preferencesResponse = await dashboardFetch(env, "/api/me/automation-preferences", { headers, signal: AbortSignal.timeout(8000) }, "dashboard_preferences_timeout");
      if (!preferencesResponse.ok) throw dashboardHttpError("dashboard_preferences", preferencesResponse);
      const preferencesPayload = await dashboardJson(preferencesResponse, "dashboard_preferences_timeout");
      const preferences = preferencesPayload && typeof preferencesPayload.preferences === "object" ? preferencesPayload.preferences : {};
      const quietHours = isDuringQuietHours(preferences, now);

      // Queue the current day's report before checking quiet hours so a quiet window
      // cannot cause a report to be lost when the next Torn reporting day begins.
      await env.BOT_DB.prepare(
        "INSERT INTO discord_daily_summary_deliveries(discord_user_id,reporting_day,status,attempts,updated_at) VALUES(?,?,'pending',0,?) ON CONFLICT(discord_user_id,reporting_day) DO NOTHING"
      ).bind(link.discordUserId, reportingDay, now.toISOString()).run();
      if (quietHours) { totals.skipped += 1; continue; }

      const pendingDays = await env.BOT_DB.prepare(
        "SELECT reporting_day AS reportingDay FROM discord_daily_summary_deliveries WHERE discord_user_id=? AND reporting_day>=? AND status <> 'delivered' AND attempts < 3 ORDER BY reporting_day ASC"
      ).bind(link.discordUserId, priorDay).all();
      for (const pending of pendingDays.results || []) {
        const metrics = { pages: 0, eventsSeen: 0, delivered: 0, failed: 0, exhausted: 0 };
        const outcome = await deliverDailyCompanySummary(env, link.discordUserId, token, pending.reportingDay, metrics);
        if (outcome === "delivered") totals.delivered += 1;
        else if (outcome === "failed" || outcome === "exhausted") totals.failed += 1;
        if (outcome === "exhausted") totals.exhausted += 1;
      }
    } catch (error) {
      totals.failed += 1;
      console.error("[daily-summary] delivery attempt failed", JSON.stringify({ code: String(error?.code || error?.message || "unknown").slice(0, 80) }));
    }
  }
  console.log("[daily-summary] delivery run", JSON.stringify(totals));
  return totals;
}

function interactionUser(interaction) {
  return interaction.member?.user?.id || interaction.user?.id || null;
}
function modalField(components, wantedId) {
  for (const item of Array.isArray(components) ? components : []) {
    if (item?.custom_id === wantedId && item.value !== undefined) return item.value;
    const nested = modalField([...(Array.isArray(item?.components) ? item.components : []), ...(item?.component ? [item.component] : [])], wantedId);
    if (nested !== undefined) return nested;
  }
  return undefined;
}
async function replyFor(interaction, env) {
  const userId = interactionUser(interaction);
  if (interaction.type === 5 && interaction.data?.custom_id === "link_code_submit") {
    if (!userId) return privateReply("Unable to identify your Discord account.");
    const code = String(modalField(interaction.data.components, "link_code") || "").trim().toLowerCase();
    if (!/^[a-f0-9]{48}$/.test(code)) return privateReply("Enter the 48-character code generated in your dashboard.");
    try {
      const response = await dashboardFetch(env, "/api/discord/link/redeem", {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ code, discordUserId: userId }), signal: AbortSignal.timeout(8000)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return privateReply(String(result.error || "The dashboard link code is invalid or expired. Generate a new one and try again."));
      if (typeof result.token !== "string" || !result.playerId) return privateReply("Dashboard linking could not be completed. Generate a new code and try again.");
      await storeBotLink(userId, String(result.playerId), result.token, env);
      return privateReply("Dashboard account linked securely. To receive the daily private DM, enable **Private DM daily summary** in the dashboard Automation Center.");
    } catch { return privateReply("Dashboard linking is temporarily unavailable. Generate a new code and try again."); }
  }

  if (interaction.type !== 2) return privateReply("Only secure account linking and the private daily summary are supported.");
  const name = interaction.data?.name;
  if (name === "link") return privateReply("**Secure dashboard linking**\n1. Open https://naughtyfamily.pages.dev and sign in.\n2. Open the Automation Center and generate a one-time Discord link code. It expires after five minutes.\n3. Run /link-code and submit the code in the private form.\n\nEnable **Private DM daily summary** in the dashboard to receive the daily report. Never post a Torn API key in Discord.");
  if (name === "link-code") return { type: 9, data: { custom_id: "link_code_submit", title: "Link dashboard account", components: [{ type: 18, label: "Dashboard link code", component: { type: 4, custom_id: "link_code", style: 1, min_length: 48, max_length: 48, required: true, placeholder: "Paste the one-time dashboard code" } }] } };
  if (!userId) return privateReply("Unable to identify your Discord account.");
  if (name === "status") {
    const row = await env.BOT_DB.prepare("SELECT dashboard_player_id,updated_at FROM discord_links WHERE discord_user_id=?").bind(userId).first();
    return privateReply(row ? "Your dashboard account is securely linked. Player ID: " + row.dashboard_player_id + ". Last linked: " + row.updated_at + ". Manage the private daily summary opt-in in the dashboard Automation Center." : "No dashboard account is linked. Run /link to see the secure setup steps.");
  }
  if (name === "unlink") {
    const row = await env.BOT_DB.prepare("SELECT encrypted_session_token,token_iv FROM discord_links WHERE discord_user_id=?").bind(userId).first();
    if (row) {
      try {
        const token = await unseal(row.encrypted_session_token, row.token_iv, env);
        await dashboardFetch(env, "/api/me/discord-link", { method: "DELETE", headers: { authorization: "Bearer " + token }, signal: AbortSignal.timeout(8000) });
      } catch { /* Local credentials must still be removed if the API is temporarily unavailable. */ }
    }
    await env.BOT_DB.batch([
      env.BOT_DB.prepare("DELETE FROM discord_daily_summary_deliveries WHERE discord_user_id=?").bind(userId),
      env.BOT_DB.prepare("DELETE FROM discord_daily_company_summary_state WHERE discord_user_id=?").bind(userId),
      env.BOT_DB.prepare("DELETE FROM discord_daily_company_summary_history WHERE discord_user_id=?").bind(userId),
      env.BOT_DB.prepare("DELETE FROM discord_links WHERE discord_user_id=?").bind(userId)
    ]);
    return privateReply("Your dashboard link and saved daily-summary delivery history have been removed.");
  }
  return privateReply("That command is no longer available. This bot now supports secure account linking and the private daily summary only.");
}

async function editOriginalInteraction(interaction, reply) {
  if (!interaction.application_id || !interaction.token) return;
  const endpoint = "https://discord.com/api/v10/webhooks/" + encodeURIComponent(interaction.application_id) + "/" + encodeURIComponent(interaction.token) + "/messages/@original";
  const messageData = reply?.type === 4 && reply.data ? { ...reply.data } : { content: "The request could not be completed. Please try again later." };
  delete messageData.flags;
  messageData.allowed_mentions = { parse: [] };
  const response = await fetch(endpoint, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(messageData) });
  if (!response.ok) console.warn("Discord deferred response update failed", response.status);
}
async function completeDeferredInteraction(interaction, env) {
  let reply;
  try { await ensureBotSchema(env); reply = await replyFor(interaction, env); }
  catch { reply = privateReply("The request could not be completed. Please try again later."); }
  try { await editOriginalInteraction(interaction, reply); }
  catch { console.warn("Discord deferred response delivery failed."); }
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runDailySummaryDelivery(env));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return json({
      ok: true, service: "naughty-company-bot", database: !!env.BOT_DB, encryption: !!env.BOT_ENCRYPTION_KEY,
      discordConfigured: !!env.DISCORD_TOKEN, dashboardBinding: !!env.DASHBOARD_API, privateDailySummary: true
    });
    if (request.method !== "POST") return json({ ok: false, error: "not_found" }, 404);
    if (!await signed(request, env)) return json({ ok: false, error: "invalid_request_signature" }, 401);
    let interaction;
    try { interaction = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    if (interaction?.type === 1) return json({ type: 1 });
    if (interaction?.type === 2 && interaction.data?.name === "link-code") {
      return json(await replyFor(interaction, env));
    }
    if (interaction?.type === 2 && interaction.data?.name === "link") return json(await replyFor(interaction, env));
    if ((interaction?.type === 2 && ["status", "unlink"].includes(interaction.data?.name)) || (interaction?.type === 5 && interaction.data?.custom_id === "link_code_submit")) {
      ctx.waitUntil(completeDeferredInteraction(interaction, env));
      return json({ type: 5, data: { flags: 64 } });
    }
    return json(privateReply("This bot now supports secure account linking and the private daily summary only."));
  }
};
