import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = (process.env.SEASONAL_AUDIT_BASE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const artifactDir = path.resolve("artifacts/seasonal-ui");
const now = new Date();
const currentYear = now.getUTCFullYear();
const historicalYear = Math.max(2021, currentYear - 2);
const priorYear = Math.max(2021, currentYear - 1);
const generatedAt = now.toISOString();
const timestamp = Math.floor(now.getTime() / 1000);
const failures = [];
const audit = {
  generatedAt,
  baseUrl,
  branch: "portal-rebuild",
  mode: "mocked authenticated session; no Torn or production API calls",
  pages: [],
  accessibility: [],
  assertions: [],
  consoleErrors: [],
  pageErrors: [],
};

await mkdir(artifactDir, { recursive: true });

function recordAssertion(name, passed, detail = "") {
  audit.assertions.push({ name, passed, detail });
  if (!passed) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  if (!passed) console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  else console.log(`PASS ${name}`);
}

function christmasMetrics(empty = false) {
  const count = (value) => empty ? 0 : value;
  const games = [
    ["present_pick", "Present Pick", 18], ["spin_the_wheel", "Spin The Wheel", 12],
    ["garland_assemble", "Garland Assemble", 3], ["santa_claws", "Santa Claws", 2],
    ["gingerbread_men", "Gingerbread Men", 4], ["word_fixer", "Word Fixer", 2],
    ["hangman", "Hangman", 2], ["christmas_wreath", "Christmas Wreath", 1],
    ["snowball_shooter", "Snowball Shooter", 2], ["typocalypse", "Typocalypse", 1],
  ].map(([key, label, value]) => ({ key, label, count: count(value) }));
  const chestKeys = ["bronze", "silver", "gold", "combination"];
  const chests = chestKeys.map((key) => ({
    key,
    label: `${key[0].toUpperCase()}${key.slice(1)} Chest`,
    opened: count(3),
    items: count(6),
    rewardsById: empty ? {} : { "8942": 2, "8941": 1 },
    events: empty ? [] : [{ timestamp, rewardsById: { "8942": 2 }, estimatedValue: 150000 }],
    estimatedValue: empty ? 0 : 450000,
    valuePerChest: empty ? 0 : 150000,
    valuePerItem: empty ? 0 : 75000,
    best: empty ? null : { timestamp, estimatedValue: 190000, rewardsById: { "8942": 1 } },
    worst: empty ? null : { timestamp: timestamp - 86400, estimatedValue: 110000, rewardsById: { "8941": 1 } },
  }));
  return {
    fromTimestamp: timestamp - 10 * 86400,
    toTimestamp: timestamp,
    days: count(8),
    logCount: count(47),
    totalItems: count(26),
    totalPricedItems: count(22),
    unpricedItems: count(4),
    estimatedValue: empty ? 0 : 2850000,
    estimatedValuePerDay: empty ? 0 : 356250,
    estimatedValuePerItem: empty ? 0 : 129545,
    minigames: games,
    santaVisits: count(5),
    gifts: count(7),
    itemFinds: count(4),
    hatsAdded: count(2),
    hatNames: empty ? {} : { "Festive Fedora": 1, "Winter Crown": 1 },
    ornamentsAdded: count(6),
    ornamentsBought: count(2),
    ornamentsOther: count(4),
    ornaments: empty ? {} : { "Ruby Star": 2, "Golden Bell": 2, "Snowflake": 2 },
    keysFound: { bronze: count(2), silver: count(1), gold: count(1) },
    chests,
    christmasBucksGained: count(4500),
    christmasBucksSpent: count(1800),
    christmasBucksSpentByItem: empty ? {} : { "8942": 2 },
    prizeCouponsGained: count(5),
    prizeCouponsSpent: count(2),
    prizeCouponsExchanged: count(1),
    prizeCouponItems: count(3),
    prizeCouponItemsById: empty ? {} : { "8938": 3 },
    pot: { roundsWon: count(2), itemsDeposited: count(5), depositValue: empty ? 0 : 325000, itemsWon: count(3), wonValue: empty ? 0 : 195000 },
    potDepositedById: empty ? {} : { "8942": 3 },
    potWonById: empty ? {} : { "8938": 2 },
    receivedItemsById: empty ? {} : { "8942": 2, "8941": 3 },
    itemNamesById: empty ? {} : { "8942": "Christmas Town Hat", "8941": "Christmas Town Ornament", "8938": "Christmas Town Item" },
    purchasedItemsById: empty ? {} : { "8938": 2 },
    items: empty ? [] : [
      { itemId: "8942", itemName: "Christmas Town Hat", quantity: 2, group: "chest", unitPrice: 125000, estimatedValue: 250000 },
      { itemId: "8941", itemName: "Christmas Town Ornament", quantity: 3, group: "other", unitPrice: 80000, estimatedValue: 240000 },
      { itemId: "8938", itemName: "Christmas Town Item", quantity: 2, group: "coupon", unitPrice: null, estimatedValue: null },
    ],
  };
}

function christmasCollection() {
  return Array.from({ length: Math.max(0, currentYear - 2021) }, (_, index) => 2021 + index).map((year) => ({
    eventYear: year,
    status: "complete",
    pagesCollected: 6,
    logsCollected: 47,
    lastError: null,
    windowStartAt: new Date(Date.UTC(year, 11, 1)).toISOString(),
    windowEndAt: new Date(Date.UTC(year + 1, 0, 1)).toISOString(),
    updatedAt: generatedAt,
  }));
}

function christmasArchive(url, empty = false) {
  const fromDate = url.searchParams.get("from") || "2021-12-01";
  const toDate = url.searchParams.get("to") || now.toISOString().slice(0, 10);
  const metrics = christmasMetrics(empty);
  const collection = christmasCollection();
  return {
    fromDate,
    toDate,
    metrics,
    market: {
      status: empty ? "empty" : "fresh",
      snapshotAt: empty ? null : timestamp - 1800,
      pricedItemCount: empty ? 0 : 2,
      itemCount: empty ? 0 : 3,
      unpricedItemCount: empty ? 0 : 1,
    },
    collection,
  };
}

function halloweenMetrics(empty = false) {
  const n = (value) => empty ? 0 : value;
  return {
    boosters: n(18), boostersUsed: n(4),
    energyCans: n(8), energyCansUsed: n(2),
    energyDrinkSixPacks: n(2), energyDrinkSixPacksUsed: n(1),
    alcoholSixPacks: n(1), alcoholSixPacksUsed: n(1),
    fhcs: n(3), fhcsUsed: n(2), greenEggs: n(2), greenEggsUsed: n(1),
    treatExchangeEnergyGained: n(120), successfulAttackEnergyUsed: n(90),
    successfulAttacks: n(38), successfulAttacksWithTreats: n(34), lostStalematedAttacks: n(4),
    treatsByAttack: empty ? {} : { "0": 4, "1": 20, "2": 10, "3": 4 },
    basketItemsById: empty ? {} : { "366": 2, "367": 1 },
    basketExchangeItems: n(12),
    doublerProcs: n(5), triplerProcs: n(3), quadruplerProcs: n(1), quintuplerProcs: n(1),
    unclassifiedTreatAwards: n(0), catInHellJackpots: n(0), multipackProcs: n(2), dealWithDevilProcs: n(1),
    revitalizeProcs: n(3), revitalizeSuccessfulAttacks: n(32), revitalizeAttacksReviewed: n(38),
    revitalizeChanceCounts: empty ? {} : { "0.1": 3 },
  };
}

function halloweenEvent(year) {
  return {
    eventYear: year,
    startAt: `${year}-10-25T16:00:00.000Z`,
    endAt: `${year}-11-01T16:00:00.000Z`,
  };
}

function halloweenWindow(year) {
  return {
    configured: true,
    startMinuteOfDay: 16 * 60,
    startTime: "16:00",
    startAt: `${year}-10-25T16:00:00.000Z`,
    endAt: `${year}-11-01T16:00:00.000Z`,
    requiresConfirmation: false,
    source: "user_confirmed",
  };
}

function halloweenMember(year, empty = false) {
  return {
    playerId: "123456",
    playerName: "Playwright Auditor",
    eventWindowConfigured: true,
    startTime: "16:00",
    keyConnected: true,
    collectionStatus: "complete",
    attackMetricsStatus: "complete",
    attackOutcomesStatus: "complete",
    pagesCollected: empty ? 0 : 12,
    logsCollected: empty ? 0 : 47,
    totalHits: empty ? 0 : 22,
    lastCollectedAt: generatedAt,
    coverage: "complete",
    completedEventYears: empty ? [] : [year],
    recordedEventYears: empty ? [] : [year],
  };
}

function halloweenArchive(yearScope, empty = false) {
  const years = Array.from({ length: Math.min(6, Math.max(1, currentYear - 2020)) }, (_, index) => currentYear - index);
  const year = yearScope === "all" ? years[0] : Number(yearScope);
  const event = halloweenEvent(year);
  const metrics = halloweenMetrics(empty);
  const member = halloweenMember(year, empty);
  const peerMetrics = halloweenMetrics(false);
  const leaderboard = empty ? [] : [member, {
    ...member,
    playerId: "654321",
    playerName: "Faction Teammate",
    totalHits: 17,
    logsCollected: 39,
    completedEventYears: [year],
  }];
  return {
    event,
    events: yearScope === "all" ? years.map(halloweenEvent) : [event],
    eventYears: yearScope === "all" ? years : [year],
    myWindow: halloweenWindow(year),
    leaderboard,
    myCollection: member,
    myEventMetrics: empty ? null : metrics,
    myExchangeMarketValue: null,
    eventTotals: empty ? null : { ...metrics, coveredMembers: 2, revitalizeCoveredMembers: 2, coveredMemberYears: 2, revitalizeCoveredMemberYears: 2 },
    memberComparisons: empty ? [] : [{
      playerId: "654321",
      playerName: "Faction Teammate",
      totalHits: 17,
      coverage: "complete",
      attackMetricsStatus: "complete",
      attackOutcomesStatus: "complete",
      completedEventYears: [year],
      metrics: peerMetrics,
    }],
  };
}

function halloweenLive(year, empty = false) {
  const event = { ...halloweenEvent(year), liveCollectionEnabled: 1 };
  const member = {
    playerId: "123456",
    playerName: "Playwright Auditor",
    eventWindowConfigured: true,
    startTime: "16:00",
    eventStartAt: event.startAt,
    eventEndAt: event.endAt,
    currentTreats: empty ? null : 11,
    totalTreats: empty ? null : 22,
    upgradesUnlocked: empty ? null : 4,
    upgrades: empty ? null : [],
    capturedAt: empty ? null : generatedAt,
    snapshotKind: empty ? null : "closing",
    sourceTimestamp: empty ? null : timestamp,
    coverage: empty ? "not_collected" : "captured",
  };
  return { event, myWindow: halloweenWindow(year), leaderboard: empty ? [] : [member], mySnapshot: empty ? null : member };
}

async function installApiFixtures(page, state) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    state.calls.push({ method, path: url.pathname, search: url.search });
    const cors = {
      "access-control-allow-origin": baseUrl,
      "access-control-allow-headers": "Authorization, Content-Type",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    };
    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors, body: "" });
      return;
    }
    const empty = state.scenario === "empty";
    const erroredArchive = state.scenario === "error" && (
      url.pathname === "/api/me/christmas-town/archive" || url.pathname === "/api/me/halloween/archive"
    );
    if (erroredArchive) {
      await route.fulfill({ status: 503, contentType: "application/json", headers: cors, body: JSON.stringify({ error: "Playwright fixture: archive service unavailable." }) });
      return;
    }

    let payload = {};
    if (url.pathname === "/api/auth/session") {
      payload = { player: { id: "123456", name: "Playwright Auditor" }, isAdmin: false, setupRequired: false, key: { saved: true, lastFour: "1234" } };
    } else if (url.pathname === "/api/me/portal-consent") {
      payload = { required: false };
    } else if (url.pathname === "/api/me/companies") {
      payload = { companies: [] };
    } else if (url.pathname === "/api/faction/directors") {
      payload = { directors: [], pending: 0, generatedAt };
    } else if (url.pathname === "/api/dashboard-members") {
      payload = { members: [] };
    } else if (url.pathname === "/api/me/data-sharing") {
      payload = { recipients: [] };
    } else if (url.pathname === "/api/me/data-backup") {
      payload = { pages: {} };
    } else if (url.pathname === "/api/me/christmas-town/calendar") {
      payload = { event: null };
    } else if (url.pathname === "/api/me/christmas-town/key") {
      payload = { connected: true, previouslyConsented: true, key: { lastFour: "4321", accessLevel: "Full Access", consentVersion: "1", consentedAt: generatedAt, lastValidatedAt: generatedAt } };
    } else if (url.pathname === "/api/me/christmas-town/archive") {
      payload = christmasArchive(url, empty);
    } else if (url.pathname === "/api/me/christmas-town/collect") {
      payload = { queued: false, jobs: [] };
    } else if (url.pathname === "/api/me/halloween/key") {
      payload = { connected: true, previouslyConsented: true, key: { lastFour: "4321", accessLevel: "Full Access", consentVersion: "1", consentedAt: generatedAt, lastValidatedAt: generatedAt } };
    } else if (url.pathname === "/api/me/halloween/event-window") {
      const year = Number(url.searchParams.get("year") || currentYear);
      payload = { myWindow: halloweenWindow(year), locked: true };
    } else if (url.pathname === "/api/me/halloween/live") {
      payload = halloweenLive(currentYear, empty);
    } else if (url.pathname === "/api/me/halloween/archive") {
      payload = halloweenArchive(url.searchParams.get("year") || "all", empty);
    } else if (url.pathname.startsWith("/api/me/halloween/members/")) {
      payload = {
        collection: { status: "complete", coverage: "complete", logsCollected: 47, completedEventYears: [historicalYear], recordedEventYears: [historicalYear] },
        dailyActivity: [{ eventYear: historicalYear, eventDay: `${historicalYear}-10-26`, totalHits: 6, relevantLogs: 7 }],
        metrics: { fhcsUsed: 2, greenEggsUsed: 1, energyCansUsed: 2 },
        logs: [{ eventYear: historicalYear, logId: "fixture-log-1", timestamp, title: "Halloween event hit", category: "Attack", labels: ["hit"], isHit: true, details: null }],
      };
    }
    await route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(payload) });
  });
}

async function auditLayout(page, pageName, viewportName, pagePath, selectorId, headingPattern, state) {
  await page.goto(`${baseUrl}${pagePath}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: headingPattern }).waitFor({ state: "visible", timeout: 30000 });
  const selector = page.locator(`#${selectorId}`);
  await selector.waitFor({ state: "visible", timeout: 30000 });
  if (pageName === "Christmas Town") await page.getByRole("heading", { name: "Minigames" }).waitFor({ state: "visible", timeout: 30000 });
  else await page.locator(".halloween-personal-window").waitFor({ state: "visible", timeout: 30000 });

  const layout = await page.evaluate(({ selectorId, isHalloween }) => {
    const heading = document.querySelector(".module-heading");
    const filter = document.querySelector(isHalloween ? ".halloween-year-filter" : ".christmas-town-year-filter");
    const select = document.getElementById(selectorId);
    const next = isHalloween ? document.querySelector(".halloween-tabs") : document.querySelector(".christmas-town-collection");
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom };
    };
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      heading: rect(heading),
      filter: rect(filter),
      select: rect(select),
      nextSection: rect(next),
      title: document.title,
      headingCount: document.querySelectorAll("h1").length,
      bodyTextLength: document.body.innerText.length,
    };
  }, { selectorId, isHalloween: pageName === "Halloween" });
  const pageReport = { page: pageName, viewport: viewportName, path: pagePath, layout, apiCalls: state.calls.slice() };
  audit.pages.push(pageReport);

  recordAssertion(`${pageName} ${viewportName}: one page title`, layout.headingCount === 1, `found ${layout.headingCount}`);
  recordAssertion(`${pageName} ${viewportName}: no horizontal page overflow`, layout.documentWidth <= layout.viewportWidth + 1, `${layout.documentWidth}px content in ${layout.viewportWidth}px viewport`);
  recordAssertion(`${pageName} ${viewportName}: year control follows page heading`, layout.filter && layout.heading && layout.filter.y >= layout.heading.bottom - 1, JSON.stringify({ heading: layout.heading, filter: layout.filter }));
  recordAssertion(`${pageName} ${viewportName}: year control is compact`, layout.select && layout.select.height <= 40 && layout.filter.height <= 64, JSON.stringify({ filter: layout.filter, select: layout.select }));
  if (pageName === "Halloween") {
    recordAssertion(`${pageName} ${viewportName}: selector precedes section tabs`, layout.nextSection && layout.filter && layout.nextSection.y >= layout.filter.bottom - 1, JSON.stringify({ filter: layout.filter, tabs: layout.nextSection }));
  } else {
    recordAssertion(`${pageName} ${viewportName}: selector precedes archive data`, layout.nextSection && layout.filter && layout.nextSection.y >= layout.filter.bottom - 1, JSON.stringify({ filter: layout.filter, data: layout.nextSection }));
  }

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const violations = axe.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    help: violation.help,
    nodes: violation.nodes.length,
    examples: violation.nodes.slice(0, 4).map(node => ({ target: node.target, summary: node.failureSummary })),
  }));
  audit.accessibility.push({ page: pageName, viewport: viewportName, passes: axe.passes.length, violations });
  const serious = violations.filter(violation => violation.impact === "critical" || violation.impact === "serious");
  recordAssertion(`${pageName} ${viewportName}: no critical/serious WCAG violations`, serious.length === 0, serious.map(v => `${v.id} (${v.nodes})`).join(", "));

  const screenshot = path.join(artifactDir, `${pageName.toLowerCase().replaceAll(" ", "-")}-${viewportName}.png`);
  await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
  pageReport.screenshot = screenshot;
  pageReport.accessibility = { passes: axe.passes.length, violations };
  return pageReport;
}

async function createPage(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "reduce" });
  await context.addInitScript(() => localStorage.setItem("ncd_session", "seasonal-playwright-audit-session"));
  const page = await context.newPage();
  const state = { scenario: "data", calls: [] };
  page.on("pageerror", error => audit.pageErrors.push({ path: page.url(), message: error.message }));
  page.on("console", message => {
    if (message.type() === "error") audit.consoleErrors.push({ path: page.url(), message: message.text() });
  });
  await installApiFixtures(page, state);
  return { context, page, state };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewportCase of [
      { name: "desktop", viewport: { width: 1440, height: 1000 } },
      { name: "tablet", viewport: { width: 768, height: 1024 } },
      { name: "mobile", viewport: { width: 390, height: 844 } },
    ]) {
      for (const pageCase of [
        { name: "Christmas Town", path: "/christmas-town", selector: "christmas-town-year", heading: /Christmas Town/i },
        { name: "Halloween", path: "/halloween", selector: "halloween-year-scope", heading: /Halloween Dashboard/i },
      ]) {
        const { context, page, state } = await createPage(browser, viewportCase.viewport);
        try {
          await auditLayout(page, pageCase.name, viewportCase.name, pageCase.path, pageCase.selector, pageCase.heading, state);
          if (viewportCase.name === "desktop" && pageCase.name === "Christmas Town") {
            const control = page.locator(`#${pageCase.selector}`);
            await control.selectOption(String(priorYear));
            await page.getByRole("heading", { name: "Minigames" }).waitFor({ state: "visible" });
            await page.waitForFunction((expected) => {
              const select = document.querySelector("#christmas-town-year");
              return select && select.value === expected;
            }, String(priorYear));
            const expectedFrom = `${priorYear}-12-01`;
            recordAssertion("Christmas Town: choosing a year requests that season only", state.calls.some(call => call.path === "/api/me/christmas-town/archive" && new URLSearchParams(call.search).get("from") === expectedFrom), expectedFrom);
            await page.screenshot({ path: path.join(artifactDir, "christmas-town-selected-year.png"), fullPage: true, animations: "disabled" });
            state.scenario = "empty";
            await page.getByRole("button", { name: /Refresh stats/i }).click();
            await page.getByRole("heading", { name: "No Christmas Town activity recorded" }).waitFor({ state: "visible", timeout: 20000 });
            recordAssertion("Christmas Town: complete collection with zero logs is explicitly confirmed", true);
            await page.screenshot({ path: path.join(artifactDir, "christmas-town-confirmed-empty.png"), fullPage: true, animations: "disabled" });
            state.scenario = "error";
            await page.getByRole("button", { name: /Refresh stats/i }).click();
            await page.getByRole("alert").waitFor({ state: "visible", timeout: 20000 });
            recordAssertion("Christmas Town: archive failure is visible and announced", true);
            await page.screenshot({ path: path.join(artifactDir, "christmas-town-error.png"), fullPage: true, animations: "disabled" });
          }
          if (viewportCase.name === "desktop" && pageCase.name === "Halloween") {
            const control = page.locator(`#${pageCase.selector}`);
            await page.waitForFunction((expected) => {
              const select = document.querySelector("#halloween-year-scope");
              return select && [...select.options].some(option => option.value === expected);
            }, String(historicalYear));
            await control.selectOption(String(historicalYear));
            await page.getByRole("heading", { name: "Historical event records" }).waitFor({ state: "visible", timeout: 20000 });
            recordAssertion("Halloween: choosing a year switches to its historical archive", await control.inputValue() === String(historicalYear), String(historicalYear));
            const memberButton = page.locator(".historical-member-link").first();
            await memberButton.waitFor({ state: "visible", timeout: 20000 });
            await memberButton.click();
            await page.getByText("MEMBER EVENT PROFILE", { exact: true }).waitFor({ state: "visible", timeout: 20000 });
            recordAssertion("Halloween: member detail opens from the historical leaderboard", true);
            await page.getByRole("button", { name: "Close" }).click();
            await control.selectOption("all");
            await page.getByRole("heading", { name: "Historical event records" }).waitFor({ state: "visible" });
            recordAssertion("Halloween: all-time archive selection remains in Historical mode", await control.inputValue() === "all", "all recorded years");
            await page.screenshot({ path: path.join(artifactDir, "halloween-all-years.png"), fullPage: true, animations: "disabled" });
            await page.getByRole("button", { name: /Live \/ Current Year/i }).click();
            recordAssertion("Halloween: Live tab and year selector stay synchronized", await control.inputValue() === "live", "current year");
            state.scenario = "empty";
            await control.selectOption("all");
            await page.getByRole("heading", { name: "Historical event records" }).waitFor({ state: "visible" });
            await page.getByText("No member event logs have been contributed yet.", { exact: true }).waitFor({ state: "visible", timeout: 20000 });
            recordAssertion("Halloween: empty archive explains unavailable coverage instead of showing false zeroes", true);
            await page.screenshot({ path: path.join(artifactDir, "halloween-empty.png"), fullPage: true, animations: "disabled" });
            state.scenario = "error";
            await page.getByRole("button", { name: /Refresh archive/i }).click();
            await page.getByRole("alert").waitFor({ state: "visible", timeout: 20000 });
            recordAssertion("Halloween: archive failure is visible and announced", true);
            await page.screenshot({ path: path.join(artifactDir, "halloween-error.png"), fullPage: true, animations: "disabled" });
          }
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  audit.summary = {
    assertions: audit.assertions.length,
    passed: audit.assertions.filter(item => item.passed).length,
    failed: audit.assertions.filter(item => !item.passed).length,
    axeViolations: audit.accessibility.reduce((sum, result) => sum + result.violations.length, 0),
    seriousAxeViolations: audit.accessibility.reduce((sum, result) => sum + result.violations.filter(item => item.impact === "critical" || item.impact === "serious").length, 0),
    pageErrors: audit.pageErrors.length,
    consoleErrors: audit.consoleErrors.length,
  };
  await writeFile(path.join(artifactDir, "audit-report.json"), JSON.stringify(audit, null, 2));
  console.log("SEASONAL_UI_AUDIT_SUMMARY " + JSON.stringify(audit.summary));
  if (failures.length || audit.pageErrors.length || audit.summary.seriousAxeViolations) {
    console.error("Seasonal UI audit failures:\\n" + failures.join("\\n"));
    process.exitCode = 1;
  }
}

await main();
