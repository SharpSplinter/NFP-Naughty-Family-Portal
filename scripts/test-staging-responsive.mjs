import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.STAGING_PAGES_URL || "https://naughtyfamily-staging.pages.dev";
const apiBase = process.env.STAGING_API_URL || "https://naughtyfamily-api-staging.kboone801.workers.dev";
const sessionToken = process.env.STAGING_TEST_SESSION_TOKEN || "";
const otherSessionToken = process.env.STAGING_TEST_OTHER_SESSION_TOKEN || "";
const companyId = process.env.STAGING_TEST_COMPANY_ID || "";
const playerId = process.env.STAGING_TEST_PLAYER_ID || "";
const otherPlayerId = process.env.STAGING_TEST_OTHER_PLAYER_ID || "";
const primarySeries = JSON.parse(process.env.STAGING_TEST_EXPECTED_INCOME_SERIES || "[]");
const otherSeries = JSON.parse(process.env.STAGING_TEST_OTHER_INCOME_SERIES || "[]");

assert.ok(sessionToken && otherSessionToken && companyId && playerId && otherPlayerId, "Authenticated staging fixture variables are missing.");
assert.equal(primarySeries.length, 7, "Expected seven primary-owner historical income points.");
assert.equal(otherSeries.length, 7, "Expected seven second-owner historical income points.");

const historyUrl = apiBase + "/api/me/companies/" + encodeURIComponent(companyId) + "/history?days=90";
const authenticatedGet = (token, path) => fetch(path, {
  headers: { authorization: "Bearer " + token, accept: "application/json" },
});

async function loadPrivateHistory(token, label, expectedPlayerId, expectedSeries) {
  const sessionResponse = await authenticatedGet(token, apiBase + "/api/auth/session");
  assert.equal(sessionResponse.status, 200, label + " session should be accepted by the normal Worker session middleware.");
  const session = await sessionResponse.json();
  assert.equal(session.player.id, expectedPlayerId, label + " session should resolve to its own synthetic player ID.");
  assert.equal(session.isAdmin, false, label + " fixture must not receive administrator privileges.");

  const response = await authenticatedGet(token, historyUrl);
  const payload = await response.json().catch(() => null);
  assert.equal(response.status, 200, label + " private history should load successfully.");
  assert.equal(payload?.company?.companyId, companyId, label + " should receive its own connected company record.");
  assert.equal(payload?.summary?.snapshotCount, 7, label + " should receive seven daily reporting points.");
  assert.deepEqual(payload.history.map(point => point.dailyIncome), expectedSeries, label + " must receive only its own daily-income series.");
  assert.deepEqual(payload.history.map(point => point.dailyProfit), expectedSeries.map(value => value - (label === "primary member" ? 151250 : 353150)));
  assert.ok(payload.history.every(point => point.dailyProfitSource === "reported"), label + " profit points should retain their reported source.");
  assert.ok(payload.history.every(point => point.advertisingBudget === (label === "primary member" ? 50000 : 120000)));
  assert.ok(payload.history.every(point => point.employeeWages === (label === "primary member" ? 100000 : 230000)));
  assert.ok(payload.history.every(point => point.stockOrderExpense === (label === "primary member" ? 1250 : 3150)));
  return payload;
}

// The history route must fail closed without a session.
const anonymousResponse = await fetch(historyUrl);
assert.equal(anonymousResponse.status, 401, "Unauthenticated history requests must be rejected.");
const primaryHistory = await loadPrivateHistory(sessionToken, "primary member", playerId, primarySeries);
const otherHistory = await loadPrivateHistory(otherSessionToken, "other member", otherPlayerId, otherSeries);

// Both synthetic members intentionally own a company with the same ID but different data.
// A response must be scoped to the bearer token's player_id, never just the company ID.
assert.notDeepEqual(primaryHistory.history.map(point => point.dailyIncome), otherHistory.history.map(point => point.dailyIncome));
assert.ok(!primaryHistory.history.some(point => otherSeries.includes(point.dailyIncome)), "Primary member response leaked the other member's income series.");
assert.ok(!otherHistory.history.some(point => primarySeries.includes(point.dailyIncome)), "Other member response leaked the primary member's income series.");

// Gym training history is available only after the central historical-collection opt-in.
// These synthetic members have current policy acknowledgement but collection defaults off.
const gymHistoryResponse = await authenticatedGet(sessionToken, apiBase + "/api/me/gym-training/history");
assert.equal(gymHistoryResponse.status, 200, "Gym training history status should be available to an authenticated member.");
const gymHistory = await gymHistoryResponse.json();
assert.equal(gymHistory.collectionEnabled, false, "Staging fixture should begin with central historical collection disabled.");
assert.equal(gymHistory.connected, false, "Gym training must not create a member-key connection before opt-in.");
assert.equal(gymHistory.totalLogs, 0, "A new staging member must not expose any gym training history.");
const blockedGymQueue = await fetch(apiBase + "/api/me/gym-training/collect", {
  method: "POST",
  headers: { authorization: "Bearer " + sessionToken, accept: "application/json" },
});
assert.equal(blockedGymQueue.status, 409, "Gym training backfill must refuse to queue while central historical collection is off.");
console.log("PASS gym training history: private status readable; queue blocked until central historical collection is explicitly enabled.");
console.log("PASS authenticated history API: 7 private points per owner; anonymous requests rejected; same-company cross-member data remains isolated.");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const failures = [];
const browserDiagnostics = { pageErrors: [], consoleErrors: [], requestFailures: [] };
page.on("pageerror", error => browserDiagnostics.pageErrors.push(error.message));
page.on("console", message => {
  if (message.type() === "error") browserDiagnostics.consoleErrors.push(message.text());
});
page.on("requestfailed", request => {
  if (request.url().includes("/api/")) browserDiagnostics.requestFailures.push({
    url: request.url(),
    error: request.failure()?.errorText || "Request failed",
  });
});
mkdirSync("test-results/staging-responsive", { recursive: true });

try {
  await page.addInitScript((token) => {
    localStorage.setItem("ncd_session", token);
    sessionStorage.removeItem("ncd_active_view");
  }, sessionToken);

  const response = await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30000 });
  assert.ok(response?.ok(), "Staging portal returned HTTP " + response?.status());
  // Do not race the app's asynchronous session restoration and saved-company lookup.
  await page.getByText("TORN ID " + playerId, { exact: true }).waitFor({ state: "visible", timeout: 20000 });
  const companyWorkspaceCard = page.getByRole("button", { name: /Company Dashboard/ });
  await companyWorkspaceCard.waitFor({ state: "visible", timeout: 20000 });
  await companyWorkspaceCard.click();
  await page.locator(".company-module").waitFor({ state: "visible", timeout: 15000 });

  const primaryNav = page.getByRole("navigation", { name: "Company dashboard categories" });
  const companyNav = page.getByRole("navigation", { name: "Company pages" });
  await primaryNav.waitFor({ state: "visible" });
  await companyNav.waitFor({ state: "visible" });

  // Capture the exact owner-scoped history request initiated by the real UI.
  const historyResponsePromise = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname.startsWith("/api/me/companies/") && url.pathname.endsWith("/history");
  }, { timeout: 25000 }).catch(() => null);

  // Navigate as an authenticated member into the real private-history view.
  await primaryNav.getByRole("button", { name: "Insights", exact: true }).click();
  const insightsNav = page.getByRole("navigation", { name: "Insights pages" });
  await insightsNav.waitFor({ state: "visible" });
  await insightsNav.getByRole("button", { name: "Historical Trends", exact: true }).click();

  const trendsPageHeading = page.locator(".company-module-heading h1").filter({
    hasText: /^Historical Trends and Comparisons$/,
  });
  await trendsPageHeading.waitFor({ state: "visible", timeout: 20000 });
  assert.equal(await trendsPageHeading.count(), 1, "Expected one page-level Historical Trends heading.");

  const trendsToolbar = page.locator(".insights-range-toolbar");
  await trendsToolbar.waitFor({ state: "visible", timeout: 20000 });
  const historyWindow = trendsToolbar.getByRole("combobox", { name: "History window" });
  await historyWindow.waitFor({ state: "visible" });
  assert.equal(await historyWindow.inputValue(), "90", "Authenticated Trends should expose the default 90-day history selector.");

  const historyResponse = await historyResponsePromise;
  let historyResponseBody = null;
  if (historyResponse) {
    historyResponseBody = await historyResponse.json().catch(async () => ({
      responseText: (await historyResponse.text().catch(() => "")).slice(0, 2000),
    }));
  }

  const historyPanel = page.locator(".insights-table-panel").last();
  await historyPanel.waitFor({ state: "visible", timeout: 20000 });
  const historyRows = historyPanel.locator("tbody tr");
  try {
    await historyRows.first().waitFor({ state: "visible", timeout: 15000 });
  } catch {
    await page.screenshot({ path: "test-results/staging-responsive/historical-trends-load-failure.png", fullPage: true });
    const companyBadge = await page.locator(".insights-intro-actions .count-chip").last().innerText().catch(() => "not rendered");
    const visibleErrors = await page.locator(".insights-workspace [role='alert']").allInnerTexts().catch(() => []);
    const emptyState = await historyPanel.locator(".empty-state").innerText().catch(() => "no empty state");
    throw new Error("Authenticated Historical Trends did not render its seven private rows. " + JSON.stringify({
      expectedCompanyId: companyId,
      expectedPlayerId: playerId,
      companyBadge,
      historyResponse: historyResponse ? {
        status: historyResponse.status(),
        url: historyResponse.url(),
        company: historyResponseBody?.company ?? null,
        historyCount: Array.isArray(historyResponseBody?.history) ? historyResponseBody.history.length : null,
        error: historyResponseBody?.error ?? null,
      } : "No history request was issued",
      visibleErrors,
      emptyState,
      browserDiagnostics,
    }));
  }
  assert.equal(await historyRows.count(), 7, "Authenticated private history table should render all seven saved reporting points.");

  const latestRowText = await historyRows.first().innerText();
  const format = value => Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const latestIncome = primarySeries[primarySeries.length - 1];
  const latestProfit = latestIncome - 151250;
  for (const expected of [latestIncome, latestProfit, 50000, 100000, 1250, 10600]) {
    assert.ok(latestRowText.includes(format(expected)), "Latest private history row is missing expected value " + format(expected) + ".");
  }
  assert.ok(!latestRowText.includes(format(otherSeries[otherSeries.length - 1])), "The rendered primary-member history table must not contain the other member's private income.");
  console.log("PASS authenticated private history UI: " + (await historyRows.count()) + " reporting rows, income/profit/cost/stock fields, and no second-member sentinel.");

  const viewports = [
    { width: 320, height: 720, label: "phone-320" },
    { width: 360, height: 800, label: "phone-360" },
    { width: 390, height: 844, label: "phone-390" },
    { width: 430, height: 932, label: "phone-430" },
    { width: 640, height: 900, label: "breakpoint-640" },
    { width: 768, height: 1024, label: "tablet-768" },
    { width: 1024, height: 768, label: "tablet-1024" },
    { width: 1440, height: 900, label: "desktop-1440" },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(80);
    const metrics = await page.evaluate(() => {
      const root = document.documentElement;
      const shell = document.querySelector(".company-module");
      const main = document.querySelector(".company-module .main-area");
      const groups = document.querySelector(".company-workspace-groups");
      const tabs = document.querySelector(".company-workspace-views");
      const rect = element => {
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width) };
      };
      return {
        viewportWidth: window.innerWidth,
        documentWidth: root.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        shell: rect(shell),
        main: rect(main),
        groupTabs: rect(groups),
        pageTabs: rect(tabs),
        groupTabsScrollable: !!groups && groups.scrollWidth > groups.clientWidth,
        pageTabsScrollable: !!tabs && tabs.scrollWidth > tabs.clientWidth,
      };
    });

    const ok = metrics.documentWidth <= viewport.width + 1 && metrics.bodyWidth <= viewport.width + 1;
    console.log((ok ? "PASS " : "FAIL ") + viewport.label + ": " + JSON.stringify(metrics));
    if (!ok) failures.push(viewport.label + ": document overflow (" + metrics.documentWidth + "px for " + viewport.width + "px viewport)");
    assert.ok(metrics.shell && metrics.main && metrics.groupTabs && metrics.pageTabs, viewport.label + ": Company workspace layout elements missing");
    await page.screenshot({ path: "test-results/staging-responsive/" + viewport.label + ".png", fullPage: true });
  }

  // Account Settings must fit the viewport without forcing document-level horizontal scrolling.
  const settingsPage = await context.newPage();
  await settingsPage.goto(baseUrl + "/settings", { waitUntil: "networkidle", timeout: 30000 });
  const settingsModule = settingsPage.locator(".settings-module");
  await settingsModule.waitFor({ state: "visible", timeout: 20000 });
  const settingsGrid = settingsModule.locator(".settings-grid");
  await settingsGrid.waitFor({ state: "visible", timeout: 10000 });
  const privateLiveCard = settingsModule.locator(".settings-private-live-card");
  await privateLiveCard.waitFor({ state: "visible", timeout: 10000 });

  // Optional sharing toggles now live in the centralized privacy/setup workspace,
  // not in Account Settings. Verify them there instead of expecting duplicate prompts.
  const setupPage = await context.newPage();
  await setupPage.goto(baseUrl + "/setup", { waitUntil: "networkidle", timeout: 30000 });
  await setupPage.locator(".portal-setup-page").waitFor({ state: "visible", timeout: 20000 });
  const dataSharingSection = setupPage.locator(".portal-setup-section").filter({
    has: setupPage.getByRole("heading", { name: "Data sharing", exact: true }),
  });
  await dataSharingSection.waitFor({ state: "visible", timeout: 10000 });
  const sharingControls = dataSharingSection.locator("label.portal-setup-check");
  assert.equal(await sharingControls.count(), 2, "Central setup should expose the optional live-sharing and networth choices.");
  for (const viewport of viewports) {
    await settingsPage.setViewportSize({ width: viewport.width, height: viewport.height });
    await settingsPage.waitForTimeout(80);
    const metrics = await settingsPage.evaluate(() => {
      const root = document.documentElement;
      const module = document.querySelector(".settings-module");
      const grid = document.querySelector(".settings-module .settings-grid");
      const cards = [...document.querySelectorAll(".settings-module .settings-card")];
      const privateLiveCard = document.querySelector(".settings-module .settings-private-live-card");
      const bounds = element => {
        const box = element.getBoundingClientRect();
        return { left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width) };
      };
      return {
        viewportWidth: window.innerWidth,
        documentWidth: root.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        module: bounds(module),
        grid: bounds(grid),
        rowGap: parseFloat(getComputedStyle(grid).rowGap) || 0,
        cards: cards.map(bounds),
        privateLiveCard: bounds(privateLiveCard),
      };
    });
    const withinViewport = metrics.documentWidth <= viewport.width + 1
      && metrics.bodyWidth <= viewport.width + 1
      && metrics.module.left >= -1
      && metrics.module.right <= viewport.width + 1
      && metrics.grid.left >= -1
      && metrics.grid.right <= viewport.width + 1
      && metrics.cards.every(card => card.left >= -1 && card.right <= viewport.width + 1);
    await setupPage.setViewportSize({ width: viewport.width, height: viewport.height });
    await setupPage.waitForTimeout(80);
    const setupMetrics = await setupPage.evaluate(() => {
      const root = document.documentElement;
      const sharing = [...document.querySelectorAll(".portal-setup-section")].find(section =>
        section.querySelector("h2")?.textContent?.trim() === "Data sharing"
      );
      const controls = [...(sharing?.querySelectorAll("label.portal-setup-check") || [])].map(label => {
        const box = label.getBoundingClientRect();
        const checkbox = label.querySelector('input[type="checkbox"]')?.getBoundingClientRect();
        return {
          left: Math.round(box.left),
          right: Math.round(box.right),
          checkboxLeft: checkbox ? Math.round(checkbox.left) : null,
          checkboxWidth: checkbox ? checkbox.width : 0,
        };
      });
      return { documentWidth: root.scrollWidth, bodyWidth: document.body.scrollWidth, controls };
    });
    const sharingLabelsReadable = setupMetrics.controls.length === 2 &&
      setupMetrics.controls.every(control => control.left >= -1 && control.right <= viewport.width + 1 &&
        control.checkboxLeft !== null && control.checkboxLeft >= control.left - 1 &&
        control.checkboxLeft <= control.left + 20 && control.checkboxWidth >= 14 && control.checkboxWidth <= 22);
    const setupWithinViewport = setupMetrics.documentWidth <= viewport.width + 1 &&
      setupMetrics.bodyWidth <= viewport.width + 1;
    console.log((withinViewport && sharingLabelsReadable && setupWithinViewport ? "PASS " : "FAIL ") + "settings-" + viewport.label + ": " + JSON.stringify({ settings: metrics, setup: setupMetrics }));
    assert.ok(withinViewport, "Account Settings overflowed or a card exceeded the viewport at " + viewport.label);
    assert.ok(sharingLabelsReadable, "Central data-sharing controls are missing or misaligned at " + viewport.label);
    assert.ok(setupWithinViewport, "Central setup overflowed the viewport at " + viewport.label);
    assert.ok(metrics.rowGap >= 8, "Account Settings cards are too tightly spaced at " + viewport.label);
    await settingsPage.screenshot({ path: "test-results/staging-responsive/settings-" + viewport.label + ".png", fullPage: true });
    await setupPage.screenshot({ path: "test-results/staging-responsive/setup-" + viewport.label + ".png", fullPage: true });
  }
  await settingsPage.close();
  await setupPage.close();
  console.log("PASS Account Settings and centralized sharing controls at " + viewports.length + " viewports.");

  // Confirm a narrow screen can switch to another top-level area without losing the Company shell.
  await page.setViewportSize({ width: 390, height: 844 });
  await primaryNav.getByRole("button", { name: "Rankings", exact: true }).click();
  const rankingsNav = page.getByRole("navigation", { name: "Rankings pages" });
  await rankingsNav.waitFor({ state: "visible" });
  await rankingsNav.getByRole("button", { name: "Faction Rankings", exact: true }).click();
  await page.locator(".company-module").waitFor({ state: "visible" });
  assert.equal(await page.locator(".sidebar").evaluate(element => getComputedStyle(element).display), "none");
  if (failures.length) throw new Error(failures.join("\n"));
  console.log("PASS responsive authenticated Company workspace checks at " + viewports.length + " viewports; Trends data and Rankings/Faction navigation verified.");
} finally {
  await browser.close();
}
