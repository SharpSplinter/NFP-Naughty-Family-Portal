import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.STAGING_PAGES_URL || "https://naughtyfamily-staging.pages.dev";
const apiBase = process.env.STAGING_API_URL || "https://naughtyfamily-api-staging.kboone801.workers.dev";
const token = process.env.STAGING_FEATURE_SESSION_TOKEN || "";
const playerId = process.env.STAGING_FEATURE_PLAYER_ID || "999999005";
const otherPlayerId = process.env.STAGING_TEST_OTHER_PLAYER_ID || "999999002";
const privatePlayerId = process.env.STAGING_TEST_PLAYER_ID || "999999001";
const partialPlayerId = "999999006";

assert.ok(token, "Synthetic feature-walkthrough session is missing.");
assert.equal(playerId, "999999005", "Feature walkthrough must use its dedicated synthetic staging member.");

async function api(path, options = {}, bearer = token) {
  const headers = new Headers(options.headers || {});
  headers.set("accept", "application/json");
  if (bearer) headers.set("authorization", "Bearer " + bearer);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(apiBase + path, { ...options, headers, signal: AbortSignal.timeout(20000) });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}
function ok(result, label) {
  assert.equal(result.response.status, 200, label + " should return HTTP 200; received " + result.response.status + ": " + JSON.stringify(result.payload));
}

const session = await api("/api/auth/session");
ok(session, "Feature walkthrough session");
assert.equal(String(session.payload?.player?.id), playerId);
assert.equal(session.payload?.isAdmin, false, "Feature walkthrough member must remain an ordinary member.");

// Torn calendar paths use fresh, synthetic cache rows. No request below is allowed
// to validate a member key or call Torn; only the cached calendar response is read.
const christmasCalendar = await api("/api/me/christmas-town/calendar");
ok(christmasCalendar, "Christmas Town calendar");
assert.equal(christmasCalendar.payload?.event?.title, "Christmas Town");
assert.equal(christmasCalendar.payload?.event?.fixedStartTime, true);
assert.equal(christmasCalendar.payload?.event?.startAt, "2026-12-01T00:00:00.000Z");
assert.equal(christmasCalendar.payload?.event?.endAt, "2027-01-01T00:00:00.000Z");
assert.equal(christmasCalendar.payload?.event?.personalStartTimeDetected, false);

const halloweenWindow = await api("/api/me/halloween/event-window?year=2026");
ok(halloweenWindow, "Halloween personal event window");
assert.equal(halloweenWindow.payload?.myWindow?.configured, true);
assert.equal(halloweenWindow.payload?.myWindow?.startTime, "12:00");
assert.equal(halloweenWindow.payload?.myWindow?.source, "torn_api");
assert.equal(halloweenWindow.payload?.myWindow?.startAt, "2026-10-25T12:00:00.000Z");
assert.equal(halloweenWindow.payload?.myWindow?.endAt, "2026-11-01T12:00:00.000Z");

const halloweenLive = await api("/api/me/halloween/live?year=2026");
ok(halloweenLive, "Halloween live/current-year board");
assert.equal(halloweenLive.payload?.event?.eventYear, 2026);
assert.equal(halloweenLive.payload?.mySnapshot?.coverage, "captured");
assert.equal(halloweenLive.payload?.mySnapshot?.currentTreats, 35);
assert.equal(halloweenLive.payload?.mySnapshot?.totalTreats, 500);
assert.ok(halloweenLive.payload?.leaderboard?.some(row => row.playerId === playerId && row.coverage === "captured"));
assert.ok(halloweenLive.payload?.leaderboard?.some(row => row.playerId === otherPlayerId && row.coverage === "captured"));

const halloweenAll = await api("/api/me/halloween/archive?year=all");
ok(halloweenAll, "Halloween all-time archive");
assert.ok(halloweenAll.payload?.eventYears?.includes(2026));
assert.equal(halloweenAll.payload?.myCollection?.playerId, playerId);
assert.equal(halloweenAll.payload?.myCollection?.coverage, "complete");
assert.equal(halloweenAll.payload?.myCollection?.attackMetricsStatus, "complete");
assert.equal(halloweenAll.payload?.myCollection?.attackOutcomesStatus, "complete");
assert.equal(halloweenAll.payload?.myEventMetrics?.revitalizeProcs, 12);
assert.equal(halloweenAll.payload?.myEventMetrics?.revitalizeSuccessfulAttacks, 64);
assert.equal(halloweenAll.payload?.myEventMetrics?.revitalizeAttacksReviewed, 80);
assert.equal(halloweenAll.payload?.eventTotals?.revitalizeProcs, 17);
assert.equal(halloweenAll.payload?.eventTotals?.revitalizeSuccessfulAttacks, 114);
const allTimeComparison = halloweenAll.payload?.memberComparisons?.find(row => row.playerId === otherPlayerId);
assert.ok(allTimeComparison?.metrics, "All-time archive should expose the explicitly shared synthetic member comparison.");
assert.equal(allTimeComparison.metrics.revitalizeProcs, 5);
const partialAllTime = halloweenAll.payload?.leaderboard?.find(row => row.playerId === partialPlayerId);
assert.equal(partialAllTime?.coverage, "partial", "Failed archive with retained logs must be shown as partial, not zero or complete.");

const halloweenYear = await api("/api/me/halloween/archive?year=2026");
ok(halloweenYear, "Halloween year-specific archive");
assert.equal(halloweenYear.payload?.event?.eventYear, 2026);
assert.equal(halloweenYear.payload?.myCollection?.coverage, "complete");
assert.ok(halloweenYear.payload?.memberComparisons?.some(row => row.playerId === otherPlayerId));
assert.equal(halloweenYear.payload?.leaderboard?.find(row => row.playerId === partialPlayerId)?.coverage, "partial");

const sharedMemberDetail = await api("/api/me/halloween/members/" + otherPlayerId + "?year=2026");
ok(sharedMemberDetail, "Shared Halloween member detail");
assert.equal(sharedMemberDetail.payload?.collection?.coverage, "complete");
const privateMemberDetail = await api("/api/me/halloween/members/" + privatePlayerId + "?year=2026");
assert.equal(privateMemberDetail.response.status, 403, "A member who has not opted to share Halloween history must remain hidden.");

const christmasKey = await api("/api/me/christmas-town/key");
ok(christmasKey, "Christmas Town retained-key status");
assert.equal(christmasKey.payload?.connected, false, "Synthetic archive represents a disconnected event key.");
assert.equal(christmasKey.payload?.previouslyConsented, true, "Initial consent should remain recorded after disconnection.");
const today = new Date().toISOString().slice(0, 10);
const christmasArchive = await api("/api/me/christmas-town/archive?from=2021-12-01&to=" + today);
ok(christmasArchive, "Christmas Town all-time archive");
assert.ok(christmasArchive.payload?.metrics?.logCount >= 1, "Christmas Town archive should retain the synthetic season record.");
assert.ok(christmasArchive.payload?.metrics?.minigames?.some(game => game.key === "present_pick" && game.count === 1));
assert.ok(christmasArchive.payload?.collection?.some(job => job.eventYear === 2025 && job.status === "complete"));

const gymHistory = await api("/api/me/gym-training/history");
ok(gymHistory, "Gym Training private history");
assert.equal(gymHistory.payload?.collectionEnabled, true);
assert.equal(gymHistory.payload?.connected, true);
assert.equal(gymHistory.payload?.key?.lastFour, "4242");
assert.equal(gymHistory.payload?.job?.status, "complete");
assert.equal(gymHistory.payload?.totalLogs, 2);
assert.deepEqual(gymHistory.payload?.logs?.map(row => row.title).sort(), [
  "Gym training - Endurance",
  "Gym training - Strength",
]);
const gymCollect = await api("/api/me/gym-training/collect", { method: "POST", body: "{}" });
ok(gymCollect, "Gym Training idempotent collection request");
assert.equal(gymCollect.payload?.alreadyComplete, true);
assert.equal(gymCollect.payload?.queued, false, "A completed archive must not enqueue another Torn collection job.");

// Exercise the one-time Discord /link-code hand-off with a synthetic Discord snowflake.
// This creates a temporary row for the synthetic member only; it is disconnected below.
const generatedCode = await api("/api/me/discord-link-code", { method: "POST", body: "{}" });
ok(generatedCode, "Discord one-time link-code creation");
assert.match(generatedCode.payload?.code ?? "", /^[a-f0-9]{48}$/);
assert.equal(generatedCode.payload?.expiresInSeconds, 300);
const discordUserId = "999999999999999999";
const redemption = await api("/api/discord/link/redeem", {
  method: "POST",
  body: JSON.stringify({ code: generatedCode.payload.code, discordUserId }),
}, "");
ok(redemption, "Discord link-code redemption");
assert.equal(redemption.payload?.playerId, playerId);
assert.equal(redemption.payload?.token, token, "Discord redemption must return the original synthetic portal session.");
const replay = await api("/api/discord/link/redeem", {
  method: "POST",
  body: JSON.stringify({ code: generatedCode.payload.code, discordUserId }),
}, "");
assert.equal(replay.response.status, 400, "A redeemed one-time code must not be reusable.");
const linkStatus = await api("/api/me/discord-link");
ok(linkStatus, "Discord linked-account status");
assert.equal(linkStatus.payload?.linked, true);
assert.equal(linkStatus.payload?.discordUserId, discordUserId);
const disconnect = await api("/api/me/discord-link", { method: "DELETE" });
ok(disconnect, "Discord disconnect");
const disconnectedStatus = await api("/api/me/discord-link");
ok(disconnectedStatus, "Discord disconnected status");
assert.equal(disconnectedStatus.payload?.linked, false);

const botSource = readFileSync("bot/production-worker.js", "utf8");
assert.ok(botSource.includes('if (name === "link-code")'), "Production bot must retain the /link-code modal interaction.");
assert.ok(botSource.includes("https://naughtyfamily.pages.dev"), "The bot's /link instructions must point at the new portal.");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1365, height: 950 } });
const page = await context.newPage();
mkdirSync("test-results/staging-features", { recursive: true });
const consoleErrors = [];
page.on("pageerror", error => consoleErrors.push(error.message));

try {
  await page.addInitScript(value => {
    localStorage.setItem("ncd_session", value);
    sessionStorage.removeItem("ncd_active_view");
  }, token);

  const home = await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30000 });
  assert.ok(home?.ok(), "Staging portal shell should load.");
  await page.getByRole("heading", { name: /One faction/ }).waitFor({ state: "visible", timeout: 15000 });

  // Halloween Live/current-year, then all-time and year-specific archive.
  await page.getByRole("button", { name: "Halloween Dashboard" }).click();
  await page.getByRole("heading", { name: /Halloween Dashboard/ }).waitFor({ state: "visible", timeout: 15000 });
  const halloweenTabs = page.getByRole("navigation", { name: "Halloween dashboard sections" });
  await halloweenTabs.getByRole("button", { name: /Live \/ Current Year/ }).waitFor({ state: "visible" });
  await page.getByText("MY CURRENT TREATS", { exact: true }).waitFor({ state: "visible", timeout: 15000 });
  const liveText = await page.locator(".halloween-panel").first().innerText();
  assert.ok(liveText.includes("35") && liveText.includes("500"), "Live/current-year view should render the seeded personal snapshot.");
  await halloweenTabs.getByRole("button", { name: "Historical", exact: true }).click();
  await page.getByRole("heading", { name: "Historical event records" }).waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#halloween-compare-member option[value='" + otherPlayerId + "']").waitFor({ state: "attached", timeout: 15000 });
  await page.locator("#halloween-compare-member").selectOption(otherPlayerId);
  const comparison = page.locator(".halloween-comparison-table");
  await comparison.waitFor({ state: "visible", timeout: 10000 });
  const comparisonText = await comparison.innerText();
  assert.ok(comparisonText.includes("Staging Private History Other Member"));
  assert.ok(comparisonText.includes("5"), "Comparison should show the second member's staged Revitalize proc count.");
  const halloweenText = await page.locator(".halloween-module").innerText().catch(async () => page.locator("main").innerText());
  assert.ok(halloweenText.includes("18.75%"), "Feature member's Revitalize rate should render as 12 / 64 = 18.75%.");
  assert.ok(halloweenText.includes("Staging Partial Archive Member"), "Partial member should remain visible in the archive.");
  assert.ok(/Partial/i.test(halloweenText), "The archive UI should label incomplete coverage as Partial.");

  await page.locator("#halloween-historical-year").selectOption("2026");
  await page.getByText("Event year 2026", { exact: true }).waitFor({ state: "visible", timeout: 15000 });
  assert.ok((await page.locator("main").innerText()).includes("Historical event records"));

  await halloweenTabs.getByRole("button", { name: /Live \/ Current Year/ }).click();
  await page.getByText("MY TOTAL TREATS", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
  assert.ok((await page.locator("main").innerText()).includes("35"));

  // Christmas Town archive and the calendar-derived current-season window.
  await page.getByRole("button", { name: "Return to portal" }).click();
  await page.getByRole("button", { name: "Christmas Town" }).click();
  await page.getByRole("heading", { name: /Christmas Town/ }).waitFor({ state: "visible", timeout: 15000 });
  await page.getByText(/^PRESENT PICK$/i).waitFor({ state: "visible", timeout: 15000 });
  assert.ok((await page.locator("main").innerText()).includes("All time"));
  await page.screenshot({ path: "test-results/staging-features/christmas-town.png", fullPage: true });

  // Account Settings displays only this member's own Gym Training history.
  await page.getByRole("button", { name: "Return to portal" }).click();
  await page.getByRole("button", { name: "Account Settings" }).click();
  const gymCard = page.locator(".gym-training-history");
  await gymCard.waitFor({ state: "visible", timeout: 15000 });
  const gymUiText = await gymCard.innerText();
  assert.ok(gymUiText.includes("Connected securely"));
  assert.ok(gymUiText.includes("Recent training activity"));
  assert.ok(gymUiText.includes("Gym training - Strength"));
  assert.ok(gymUiText.includes("Gym training - Endurance"));
  await page.screenshot({ path: "test-results/staging-features/gym-training-history.png", fullPage: true });

  assert.deepEqual(consoleErrors, [], "Staging feature walkthrough should not produce uncaught browser errors.");
  await page.screenshot({ path: "test-results/staging-features/account-settings.png", fullPage: true });
} finally {
  await context.close();
  await browser.close();
}

console.log("PASS feature-specific staging API and UI walkthrough:");
console.log("- Halloween live/current-year snapshot, all-time/year-specific archive, member comparison, partial coverage and Revitalize 12/64 = 18.75%.");
console.log("- Per-member Halloween sharing boundary and Torn-calendar-derived event windows.");
console.log("- Christmas Town cached calendar and retained personal archive.");
console.log("- Private Gym Training history, completed-job idempotency and no duplicate queue submission.");
console.log("- Synthetic Discord /link-code creation, redemption, replay rejection and disconnect.");
console.log("NOTE: Real Torn API-key permission acceptance is not simulated; no real key or upstream Torn request was used.");
