import assert from "node:assert/strict";

const ACCOUNT_ID = "6c03b978ed9a59adc3f61c715bdad45c";
const STAGING_D1_ID = "02cca699-1232-495f-8a0a-de525058b92a";
const STAGING_D1_NAME = "naughtyfamily-acceptance-staging";
const TORN_API_BASE = "https://api.torn.com/v2";
const WORKER_BASE = (process.env.STAGING_API_URL || "").replace(/\/+$/, "");
const tornApiKey = process.env.TORN_API_KEY || "";
const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN || "";

assert.ok(WORKER_BASE === "https://naughtyfamily-api-staging.kboone801.workers.dev",
  "Refusing to call any Worker other than the reviewed staging API.");
assert.ok(tornApiKey, "The repository TORN_API_KEY secret is required.");
assert.ok(cloudflareToken, "CLOUDFLARE_API_TOKEN is required for exact staging-only fixture cleanup.");
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT_ID, "Refusing to access a different Cloudflare account.");

async function d1(sql, params = []) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${STAGING_D1_ID}/query`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer " + cloudflareToken,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true || !Array.isArray(payload?.result) ||
      payload.result.some(result => result?.success !== true)) {
    throw new Error("Isolated staging D1 query failed. Response details are suppressed.");
  }
  return payload.result[0];
}

async function jsonRequest(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  const body = await response.json().catch(() => null);
  return { response, body };
}

const profileResult = await jsonRequest(TORN_API_BASE + "/user/profile", {
  headers: { authorization: "ApiKey " + tornApiKey, accept: "application/json" },
});
const profile = profileResult.body?.profile;
const playerId = String(profile?.id ?? profile?.player_id ?? "");
const playerName = typeof profile?.name === "string" ? profile.name.trim() : "";
assert.ok(profileResult.response.ok && /^\d+$/.test(playerId) && playerName,
  "Could not identify the Torn account from the repository key; no staging data was changed.");

const existing = await d1(
  "SELECT player_id AS playerId FROM players WHERE player_id = ? LIMIT 1",
  [playerId],
);
assert.equal((existing.results ?? []).length, 0,
  "Refusing the live staging acceptance because this player already has a staging record. No sign-in or cleanup was attempted.");

let token = "";
let calendarAccepted = false;
let primaryError = null;
try {
  const login = await jsonRequest(WORKER_BASE + "/api/auth/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ apiKey: tornApiKey }),
  });
  token = typeof login.body?.token === "string" ? login.body.token : "";
  console.log("STAGING POST /api/auth/sign-in -> " + login.response.status);
  assert.ok(login.response.ok && token, "Staging authentication failed; response details are suppressed.");
  assert.equal(String(login.body?.player?.id ?? ""), playerId, "Staging authenticated a different Torn identity.");
  assert.equal(String(login.body?.player?.factionId ?? login.body?.player?.faction_id ?? "8317"), "8317",
    "Authenticated identity is not a Naughty Souls faction member.");

  const calendar = await jsonRequest(WORKER_BASE + "/api/me/christmas-town/calendar", {
    headers: { authorization: "Bearer " + token, accept: "application/json" },
  });
  console.log("STAGING GET /api/me/christmas-town/calendar -> " + calendar.response.status);
  assert.ok(calendar.response.ok, "The authenticated staging calendar endpoint did not return success.");
  const event = calendar.body?.event;
  assert.ok(event && event.title === "Christmas Town", "The live portal route did not resolve the Torn Christmas Town event.");
  assert.equal(Number(event.eventYear), new Date().getUTCFullYear(), "The event response is not for the current UTC year.");
  assert.ok(Number.isFinite(Date.parse(event.startAt)) && Number.isFinite(Date.parse(event.endAt)),
    "The portal route did not return valid normalized event timestamps.");
  assert.ok(Date.parse(event.endAt) > Date.parse(event.startAt), "The normalized event window is empty or reversed.");
  assert.ok(Number.isFinite(Date.parse(event.nominalStartAt)) && Number.isFinite(Date.parse(event.nominalEndAt)),
    "The portal route did not preserve the original Torn nominal event window.");
  assert.equal(typeof event.fixedStartTime, "boolean", "The portal route omitted Torn's fixed-start-time flag.");
  assert.equal(typeof event.personalStartTimeDetected, "boolean", "The portal route omitted personal calendar detection status.");

  console.log("PASS live Torn calendar through the authenticated staging Worker: " + JSON.stringify({
    playerId,
    eventYear: event.eventYear,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    nominalStartAt: event.nominalStartAt,
    nominalEndAt: event.nominalEndAt,
    fixedStartTime: event.fixedStartTime,
    personalStartTimeDetected: event.personalStartTimeDetected,
  }));
  calendarAccepted = true;
} catch (error) {
  primaryError = error;
  throw error;
} finally {
  // This identity was verified absent from staging before sign-in, so deleting
  // this exact player row is limited to the temporary account created above.
  if (token) {
    await fetch(WORKER_BASE + "/api/auth/sign-out", {
      method: "POST",
      headers: { authorization: "Bearer " + token, accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
  }
  const cleanup = await d1(
    "DELETE FROM players WHERE player_id = ? AND player_name = ?",
    [playerId, playerName],
  );
  const remaining = await d1(
    "SELECT player_id AS playerId FROM players WHERE player_id = ? LIMIT 1",
    [playerId],
  );
  assert.equal((remaining.results ?? []).length, 0, "Temporary staging member cleanup was not complete.");
  console.log("PASS temporary staging player, saved key, event-calendar cache, and session cleanup; deleted rows=" +
    String(cleanup.meta?.changes ?? "confirmed"));
  if (!calendarAccepted && !primaryError) throw new Error("Live staging calendar acceptance did not complete.");
}
