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


function trainingMarketPrice(itemId, name, averagePrice) {
  return { itemId, name, averagePrice, cacheTimestamp: timestamp, fetchedAt: Date.now() };
}

function trainingCalculatorData() {
  const price = trainingMarketPrice;
  return {
    fetchedAt: generatedAt,
    battleStats: { strength: 1000000, defense: 250000, speed: 300000, dexterity: 400000, total: 1950000 },
    perks: {
      education: ["Sports Science Bachelors"],
      book: [],
      faction: ["Steadfast: Strength training VII", "Voracity: Booster cooldown XII"],
      job: ["Fitness Center: Training Regime", "Fitness Center: Goal Oriented"],
      enhancer: ["Sports Sneakers"],
    },
    factionBonuses: {
      energyDrinkBonusPercent: 0,
      boosterCooldownBonusHours: 12,
      companyCooldownReductionPercent: 0,
      gymHappyLossReductionPercent: 50,
    },
    battleStatModifiers: {
      strength: { percent: 10, modifiers: [{ effect: "Merit", value: 10, type: "merit" }] },
      defense: { percent: 0, modifiers: [] },
      speed: { percent: 0, modifiers: [] },
      dexterity: { percent: 0, modifiers: [] },
    },
    job: {
      type: "company", name: "Fitness Center", position: "Personal Trainer",
      companyId: 101, companyTypeId: 5, rating: 5, daysInCompany: 60, points: 3,
    },
    jobPoints: {
      jobs: { army: 12, casino: 0, education: 0, grocer: 0, law: 0, medical: 0 },
      companies: [{ company: { id: 5, name: "Fitness Center" }, points: 3 }],
    },
    gym: {
      id: "gun-shop", name: "Gun Shop",
      unlockedGyms: [
        { id: "premier", name: "Premier Fitness", available: true },
        { id: "gun-shop", name: "Gun Shop", available: true },
      ],
    },
    gyms: [
      { id: "premier", name: "Premier Fitness", energyCost: 5, dots: { strength: 2, defense: 2, speed: 2, dexterity: 2 }, note: "", available: true },
      { id: "gun-shop", name: "Gun Shop", energyCost: 10, dots: { strength: 6.6, defense: 6.2, speed: 6.4, dexterity: 6.2 }, note: "", available: true },
    ],
    gymModifiers: {
      strength: { multiplier: 1.113121, baseMultiplier: 1.113121, bookBonusPercent: 0, bonuses: ["Education +1%", "Steadfast Strength VII +7%", "Training Regime +3%"] },
      defense: { multiplier: 1.0403, baseMultiplier: 1.0403, bookBonusPercent: 0, bonuses: ["Education +1%", "Training Regime +3%"] },
      speed: { multiplier: 1.092315, baseMultiplier: 1.092315, bookBonusPercent: 0, bonuses: ["Education +1%", "Training Regime +3%", "Sports Sneakers +5%"] },
      dexterity: { multiplier: 1.0403, baseMultiplier: 1.0403, bookBonusPercent: 0, bonuses: ["Education +1%", "Training Regime +3%"] },
    },
    bars: {
      energy: { current: 100, maximum: 150, increment: 5, interval: 600, tickTime: 600, fullTime: 6000 },
      happy: { current: 5025, maximum: 5025, increment: 5, interval: 900, tickTime: 900, fullTime: 0 },
    },
    refills: { energy: true, special_count: 0 },
    cooldowns: { booster: 0, drug: 0 },
    pointsAverageCost: 69000,
    items: {
      xanax: price("1", "Xanax", 850000),
      energyDrinks: {
        goose: price("101", "Can of Goose Juice", 500000),
        damp: price("102", "Can of Damp Valley", 800000),
        croco: price("103", "Can of Crocozade", 1200000),
        munster: price("104", "Can of Munster", 1800000),
        santa: price("105", "Can of Santa Shooters", 1900000),
        "red-cow": price("106", "Can of Red Cow", 2500000),
        rudolph: price("107", "Can of Rockstar Rudolph", 3000000),
        taurine: price("108", "Can of Taurine Elite", 3500000),
        "x-mass": price("109", "Can of X-MASS", 3500000),
      },
      fhc: price("367", "Feathery Hotel Coupon", 15000000),
      eroticDvd: price("3670", "Erotic DVD", 1500000),
      yellowEgg: null,
      poisonMistletoe: price("8999", "Poison Mistletoe", 2000000),
      statEnhancers: {
        strength: price("2001", "Dumbbells", 400000000),
        defense: price("2002", "Boxing Gloves", 410000000),
        speed: price("2003", "Skateboard", 420000000),
        dexterity: price("2004", "Parachute", 430000000),
      },
    },
    marketUpdatedAt: timestamp,
    errors: {},
  };
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
    } else if (url.pathname === "/api/me/training-calculator") {
      payload = trainingCalculatorData();
    } else if (url.pathname === "/api/me/gym-training/history") {
      payload = {
        collectionEnabled: true,
        connected: true,
        totalLogs: 1,
        logs: [{
          logId: "fixture-gym-log-1",
          timestamp,
          title: "Gym Training",
          category: "Gym",
          record: { details: { title: "Gym Training" }, data: { strength: 1234, energy_used: 100 } },
        }],
      };
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
  await page.goto(baseUrl + pagePath, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: headingPattern }).waitFor({ state: "visible", timeout: 30000 });

  const isTraining = pageName === "Training Calculator";
  const selector = isTraining ? page.getByTestId("training-tab-session") : page.locator("#" + selectorId);
  await selector.waitFor({ state: "visible", timeout: 30000 });
  if (pageName === "Christmas Town") await page.getByRole("heading", { name: "Minigames" }).waitFor({ state: "visible", timeout: 30000 });
  else if (pageName === "Halloween") await page.locator(".halloween-personal-window").waitFor({ state: "visible", timeout: 30000 });
  else await page.getByRole("heading", { name: "Session forecast" }).waitFor({ state: "visible", timeout: 30000 });

  const layout = await page.evaluate(({ selectorId, pageName }) => {
    const isHalloween = pageName === "Halloween";
    const isTraining = pageName === "Training Calculator";
    const heading = document.querySelector(isTraining ? ".tc-hero-copy h1" : ".module-heading");
    const filter = document.querySelector(isTraining ? ".tc-tabs" : isHalloween ? ".halloween-year-filter" : ".christmas-town-year-filter");
    const select = isTraining ? document.querySelector(".tc-tabs button.is-active") : document.getElementById(selectorId);
    const next = isTraining ? document.querySelector(".tc-layout") : isHalloween ? document.querySelector(".halloween-tabs") : document.querySelector(".christmas-town-collection");
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom };
    };
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      heading: rect(heading),
      filter: rect(filter),
      select: rect(select),
      nextSection: rect(next),
      title: document.title,
      headingCount: document.querySelectorAll("h1").length,
      bodyTextLength: document.body.innerText.length,
      activeTab: isTraining ? select?.textContent?.trim() ?? null : null,
    };
  }, { selectorId, pageName });
  const pageReport = { page: pageName, viewport: viewportName, path: pagePath, layout, apiCalls: state.calls.slice() };
  audit.pages.push(pageReport);

  recordAssertion(pageName + " " + viewportName + ": one page title", layout.headingCount === 1, "found " + layout.headingCount);
  recordAssertion(pageName + " " + viewportName + ": no horizontal page overflow",
    layout.documentWidth <= layout.viewportWidth + 1 && layout.bodyWidth <= layout.viewportWidth + 1,
    layout.documentWidth + "px document / " + layout.bodyWidth + "px body in " + layout.viewportWidth + "px viewport");

  if (isTraining) {
    recordAssertion(pageName + " " + viewportName + ": section tabs follow hero heading",
      layout.filter && layout.heading && layout.filter.y >= layout.heading.bottom - 1,
      JSON.stringify({ heading: layout.heading, tabs: layout.filter }));
    recordAssertion(pageName + " " + viewportName + ": active session tab is visible",
      Boolean(layout.select && layout.activeTab), JSON.stringify({ activeTab: layout.activeTab, tabRect: layout.select }));
    recordAssertion(pageName + " " + viewportName + ": calculator content follows tabs",
      layout.nextSection && layout.filter && layout.nextSection.y >= layout.filter.bottom - 1,
      JSON.stringify({ tabs: layout.filter, content: layout.nextSection }));
    recordAssertion(pageName + " " + viewportName + ": tab controls fit their scroll container",
      Boolean(layout.filter && layout.filter.height <= 68 && layout.filter.width <= layout.viewportWidth + 1),
      JSON.stringify(layout.filter));
  } else {
    recordAssertion(pageName + " " + viewportName + ": year control follows page heading",
      layout.filter && layout.heading && layout.filter.y >= layout.heading.bottom - 1,
      JSON.stringify({ heading: layout.heading, filter: layout.filter }));
    recordAssertion(pageName + " " + viewportName + ": year control is compact",
      layout.select && layout.select.height <= 40 && layout.filter.height <= 64,
      JSON.stringify({ filter: layout.filter, select: layout.select }));
    if (pageName === "Halloween") {
      recordAssertion(pageName + " " + viewportName + ": selector precedes section tabs",
        layout.nextSection && layout.filter && layout.nextSection.y >= layout.filter.bottom - 1,
        JSON.stringify({ filter: layout.filter, tabs: layout.nextSection }));
      const liveRegion = page.locator(".halloween-live-leaderboard");
      const liveControls = liveRegion.locator(".halloween-table-scroll-controls button");
      const liveAccess = await liveRegion.evaluate(element => ({
        tabIndex: element.tabIndex,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        controls: element.querySelectorAll(".halloween-table-scroll-controls button").length,
      }));
      recordAssertion(pageName + " " + viewportName + ": Live leaderboard has keyboard focus", liveAccess.tabIndex === 0, JSON.stringify(liveAccess));
      recordAssertion(pageName + " " + viewportName + ": Live leaderboard exposes both scroll controls", liveAccess.controls === 2, JSON.stringify(liveAccess));
      if (viewportName !== "desktop" && liveAccess.scrollWidth > liveAccess.clientWidth) {
        await liveControls.nth(1).click();
        await page.waitForFunction(() => {
          const element = document.querySelector(".halloween-live-leaderboard");
          return element instanceof HTMLElement && element.scrollLeft > 0;
        }, null, { timeout: 2500 });
        const scrolled = await liveRegion.evaluate(element => element.scrollLeft > 0);
        recordAssertion(pageName + " " + viewportName + ": right scroll button moves the Live leaderboard",
          scrolled, "scrollLeft after click: " + await liveRegion.evaluate(element => element.scrollLeft));
      }
    } else {
      recordAssertion(pageName + " " + viewportName + ": selector precedes archive data",
        layout.nextSection && layout.filter && layout.nextSection.y >= layout.filter.bottom - 1,
        JSON.stringify({ filter: layout.filter, data: layout.nextSection }));
    }
  }

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const violations = axe.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    help: violation.help,
    nodes: violation.nodes.length,
    examples: violation.nodes.slice(0, 4).map(node => ({ target: node.target, html: node.html, summary: node.failureSummary })),
  }));
  audit.accessibility.push({ page: pageName, viewport: viewportName, passes: axe.passes.length, violations });
  const serious = violations.filter(violation => violation.impact === "critical" || violation.impact === "serious");
  recordAssertion(pageName + " " + viewportName + ": no critical/serious WCAG violations",
    serious.length === 0, serious.map(v => v.id + " (" + v.nodes + ")").join(", "));

  const screenshot = path.join(artifactDir, pageName.toLowerCase().replaceAll(" ", "-") + "-" + viewportName + ".png");
  await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
  pageReport.screenshot = screenshot;
  pageReport.accessibility = { passes: axe.passes.length, violations };
  return pageReport;
}

async function auditTrainingCalculatorInteractions(page, viewportName) {
  const tab = name => page.getByTestId("training-tab-" + name);
  const noOverflow = async label => {
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    recordAssertion("Training Calculator " + viewportName + ": " + label + " has no horizontal page overflow",
      dimensions.document <= dimensions.viewport + 1 && dimensions.body <= dimensions.viewport + 1,
      JSON.stringify(dimensions));
  };
  const scanAxe = async label => {
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const violations = axe.violations.map(violation => ({
      id: violation.id, impact: violation.impact, description: violation.description,
      help: violation.help, nodes: violation.nodes.length,
      examples: violation.nodes.slice(0, 4).map(node => ({ target: node.target, html: node.html, summary: node.failureSummary })),
    }));
    audit.accessibility.push({ page: "Training Calculator · " + label, viewport: viewportName, passes: axe.passes.length, violations });
    const serious = violations.filter(violation => violation.impact === "critical" || violation.impact === "serious");
    recordAssertion("Training Calculator " + viewportName + ": " + label + " has no critical/serious WCAG violations",
      serious.length === 0, serious.map(item => item.id + " (" + item.nodes + ")").join(", "));
  };

  await tab("session").click();
  await page.getByTestId("training-stat-value").waitFor({ state: "visible" });
  const liveStrength = await page.getByTestId("training-stat-value").inputValue();
  recordAssertion("Training Calculator " + viewportName + ": battle stat autofills from /user/battlestats", liveStrength === "1000000", liveStrength);
  const activeGymDefault = await page.getByTestId("training-gym-select").inputValue();
  recordAssertion("Training Calculator " + viewportName + ": gym defaults to the live active gym", activeGymDefault === "gun-shop", activeGymDefault);
  const historyRows = await page.locator(".tc-log-row").count();
  recordAssertion("Training Calculator " + viewportName + ": saved gym training logs auto-load", historyRows === 1, String(historyRows));

  await page.getByTestId("training-stat-select").selectOption("defense");
  const changedStat = await page.locator(".tc-hero-stats strong").innerText();
  recordAssertion("Training Calculator " + viewportName + ": changing battle stat updates the live model", changedStat.includes("Defense"), changedStat);
  const liveDefense = await page.getByTestId("training-stat-value").inputValue();
  recordAssertion("Training Calculator " + viewportName + ": selected stat swaps to its own live battle stat", liveDefense === "250000", liveDefense);
  await page.getByTestId("training-stat-value").fill("500000");
  const manualDefense = await page.getByTestId("training-stat-value").inputValue();
  recordAssertion("Training Calculator " + viewportName + ": different manual battle stat is accepted", manualDefense === "500000", manualDefense);
  await page.getByTestId("training-stat-select").selectOption("strength");
  await page.getByTestId("training-stat-value").fill("1000000");

  await page.getByTestId("training-gym-select").selectOption("premier");
  const premierEnergy = await page.getByTestId("training-gym-energy").innerText();
  recordAssertion("Training Calculator " + viewportName + ": selecting a gym changes its individual train cost", premierEnergy.includes("5 energy"), premierEnergy);
  await page.getByTestId("training-gym-select").selectOption("gun-shop");
  const gunShopEnergy = await page.getByTestId("training-gym-energy").innerText();
  recordAssertion("Training Calculator " + viewportName + ": live gym catalogue provides current per-train energy", gunShopEnergy.includes("10 energy"), gunShopEnergy);

  const autoModifier = await page.getByTestId("training-effective-modifier").innerText();
  recordAssertion("Training Calculator " + viewportName + ": live /user/perks modifier is applied", autoModifier.includes("1.1131"), autoModifier);
  await page.getByTestId("training-gym-book-choice").selectOption("get-hard");
  const plannedBookModifier = await page.getByTestId("training-effective-modifier").innerText();
  recordAssertion("Training Calculator " + viewportName + ": planned Get Hard book applies its 20% gym gain", plannedBookModifier.includes("1.3357"), plannedBookModifier);
  await page.getByTestId("training-gym-book-choice").selectOption("auto");

  const sessionGain = await page.locator(".tc-metric").first().locator("strong").innerText();
  const oneTrainGain = await page.locator(".tc-metric").nth(1).locator("strong").innerText();
  const happyLossInput = page.locator(".tc-field").filter({ hasText: "Happy lost per energy" }).locator("input");
  recordAssertion("Training Calculator " + viewportName + ": live Goal Oriented special halves estimated happiness loss", 
    await happyLossInput.inputValue() === "25" && await happyLossInput.getAttribute("min") === "20" && await happyLossInput.getAttribute("max") === "30",
    "value=" + await happyLossInput.inputValue() + "; min=" + await happyLossInput.getAttribute("min") + "; max=" + await happyLossInput.getAttribute("max"));
  recordAssertion("Training Calculator " + viewportName + ": current gym session produces positive total gain", sessionGain.startsWith("+"), sessionGain);
  recordAssertion("Training Calculator " + viewportName + ": one individual 1× train has its own gain estimate", oneTrainGain.startsWith("+"), oneTrainGain);
  await noOverflow("session");

  await tab("energy").click();
  await page.getByTestId("training-book-choice").selectOption("self-control");
  await page.getByTestId("training-current-energy").fill("0");
  await page.getByTestId("training-energy-wait-hours").fill("1");
  const naturalEnergy = await page.getByTestId("training-natural-energy").first().innerText();
  recordAssertion("Training Calculator " + viewportName + ": natural regeneration follows live bar timing and the next tick phase", naturalEnergy === "+30E", naturalEnergy);
  await page.getByTestId("training-energy-wait-hours").fill("0");
  const currentEnergyMax = await page.getByTestId("training-current-energy").getAttribute("max");
  const xanaxMax = await page.getByTestId("training-xanax-count").getAttribute("max");
  recordAssertion("Training Calculator " + viewportName + ": current energy and Xanax show their live timing limits", currentEnergyMax === "1000" && xanaxMax === "1", currentEnergyMax + "E; " + xanaxMax + " Xanax at zero wait");
  const blankOtherEnergy = await page.getByTestId("training-other-energy").inputValue();
  recordAssertion("Training Calculator " + viewportName + ": empty numeric fields do not inject a zero", blankOtherEnergy === "", JSON.stringify(blankOtherEnergy));

  await page.getByTestId("training-energy-wait-hours").fill("18");
  const xanaxFor18Hours = await page.getByTestId("training-xanax-count").getAttribute("max");
  recordAssertion("Training Calculator " + viewportName + ": Xanax maximum respects the 6h drug cooldown", xanaxFor18Hours === "4", xanaxFor18Hours);
  await page.getByTestId("training-xanax-count").fill("2");
  await page.getByTestId("training-can-type").selectOption("red-cow");
  await page.getByTestId("training-can-count").fill("2");
  await page.getByTestId("training-fhc-count").fill("1");
  const xanaxMarketAuto = await page.getByTestId("training-xanax-price").inputValue();
  const canMarketAuto = await page.getByTestId("training-can-price").inputValue();
  await page.getByTestId("training-can-type").selectOption("munster");
  const munsterMarketAuto = await page.getByTestId("training-can-price").inputValue();
  await page.getByTestId("training-can-type").selectOption("red-cow");
  const redCowMarketAuto = await page.getByTestId("training-can-price").inputValue();
  const fhcMarketAuto = await page.getByTestId("training-fhc-price").inputValue();
  recordAssertion("Training Calculator " + viewportName + ": Xanax, can and FHC fields auto-fill from Item Market", 
    xanaxMarketAuto === "850000" && canMarketAuto === "2500000" && munsterMarketAuto === "1800000" && redCowMarketAuto === "2500000" && fhcMarketAuto === "15000000",
    [xanaxMarketAuto, canMarketAuto, munsterMarketAuto, redCowMarketAuto, fhcMarketAuto].join(" / "));

  await page.getByTestId("training-faction-voracity").check();
  const energyTotal = (await page.locator(".tc-energy-total strong").innerText()).replaceAll(",", "");
  recordAssertion("Training Calculator " + viewportName + ": energy plan totals 875E with capped natural regen and sequential refills", Number(energyTotal) === 875, energyTotal);
  const supplyCost = await page.locator(".tc-cost-total strong").innerText();
  recordAssertion("Training Calculator " + viewportName + ": energy plan uses live consumable market prices", supplyCost === "$21,700,000", supplyCost);

  await page.getByTestId("training-point-refill").check();
  const refillEnergyTotal = (await page.locator(".tc-energy-total strong").innerText()).replaceAll(",", "");
  const refillCost = await page.locator(".tc-cost-total strong").innerText();
  recordAssertion("Training Calculator " + viewportName + ": point refill adds one live bar and prices 25 points from /torn/stats",
    Number(refillEnergyTotal) === 1025 && refillCost === "$23,425,000",
    refillEnergyTotal + "E / " + refillCost);
  await page.getByTestId("training-point-refill").uncheck();

  await page.getByTestId("training-event-drink-bonus").check();
  const eventEnergyTotal = (await page.locator(".tc-energy-total strong").innerText()).replaceAll(",", "");
  recordAssertion("Training Calculator " + viewportName + ": event drink bonus is modeled independently", Number(eventEnergyTotal) === 950, eventEnergyTotal);
  await page.getByTestId("training-event-drink-bonus").uncheck();
  await noOverflow("energy supply");
  await scanAxe("Energy & cans");

  await tab("happy").click();
  await page.getByTestId("training-current-happy").fill("5025");
  await page.getByTestId("training-dvd-count").fill("1");
  await page.getByTestId("training-dvd-happy").selectOption("2500");
  await page.getByTestId("training-yellow-egg-count").fill("1");
  await page.getByTestId("training-mistletoe-target").fill("20000");
  await page.getByTestId("training-mistletoe-count").fill("1");
  await page.getByTestId("training-other-happy").fill("60000");
  const dvdMarketAuto = await page.getByTestId("training-dvd-price").inputValue();
  recordAssertion("Training Calculator " + viewportName + ": E-DVD auto-fills from live Item Market", dvdMarketAuto === "1500000", dvdMarketAuto);
  const yellowEggMarketAuto = await page.getByTestId("training-yellow-egg-price").inputValue();
  recordAssertion("Training Calculator " + viewportName + ": untradeable Yellow Egg does not invent a market price", yellowEggMarketAuto === "", JSON.stringify(yellowEggMarketAuto));
  await page.getByTestId("training-ecstasy").check();
  await tab("energy").click();
  const xanaxWithEcstasyMax = await page.getByTestId("training-xanax-count").getAttribute("max");
  recordAssertion("Training Calculator " + viewportName + ": Ecstasy reserves six hours after Xanax", xanaxWithEcstasyMax === "3", xanaxWithEcstasyMax);
  await tab("happy").click();
  const happyTotal = await page.locator(".tc-happy-meter-top strong").innerText();
  recordAssertion("Training Calculator " + viewportName + ": happiness items apply before Ecstasy and cap at 99,999", happyTotal === "99,999", happyTotal);
  const jumpGain = await page.locator(".tc-metric").nth(3).locator("strong").innerText();
  recordAssertion("Training Calculator " + viewportName + ": happy jump forecasts additional stat gain", jumpGain.startsWith("+"), jumpGain);
  const sequence = await page.locator(".tc-inline-note").filter({ hasText: "Sequence:" }).innerText();
  recordAssertion("Training Calculator " + viewportName + ": Ecstasy is the final item before training", sequence.includes("Ecstasy → train"), sequence);
  await noOverflow("happy jump");
  await scanAxe("99K Happy Jump");

  await tab("enhancers").click();
  const strengthSeAuto = await page.getByTestId("training-se-price").inputValue();
  await page.locator(".tc-field").filter({ hasText: "Stat to enhance" }).locator("select").selectOption("defense");
  const defenseSeAuto = await page.getByTestId("training-se-price").inputValue();
  await page.locator(".tc-field").filter({ hasText: "Stat to enhance" }).locator("select").selectOption("strength");
  await page.getByTestId("training-se-quantity").fill("2");
  const seGain = await page.locator(".tc-metric").first().locator("strong").innerText();
  recordAssertion("Training Calculator " + viewportName + ": SE market price auto-fills by selected stat", strengthSeAuto === "400000000" && defenseSeAuto === "410000000", strengthSeAuto + " / " + defenseSeAuto);
  const jobPointPanel = page.locator(".tc-panel").filter({ hasText: "Company job-point stat gains" });
  const jobPointInput = jobPointPanel.getByTestId("training-jobpoint-quantity");
  recordAssertion("Training Calculator " + viewportName + ": current company and point balance auto-fill", 
    (await jobPointPanel.innerText()).includes("Fitness Center") && (await jobPointPanel.innerText()).includes("3"),
    (await jobPointPanel.innerText()).slice(0, 450));
  recordAssertion("Training Calculator " + viewportName + ": company stat special is constrained by live job points",
    await jobPointInput.getAttribute("max") === "3", await jobPointInput.getAttribute("max"));
  await jobPointInput.fill("1");
  const jobPointGain = await jobPointPanel.locator(".tc-readout-field").filter({ hasText: "Estimated Strength gain" }).locator("strong").innerText();
  recordAssertion("Training Calculator " + viewportName + ": Roid Rage job point estimates gym-equivalent stat growth",
    jobPointGain.startsWith("+"), jobPointGain);
  await tab("session").click();
  await page.getByTestId("training-session-happy").fill("99999");
  await tab("enhancers").click();
  const jobPointGainAtHighHappy = await jobPointPanel.locator(".tc-readout-field").filter({ hasText: "Estimated Strength gain" }).locator("strong").innerText();
  recordAssertion("Training Calculator " + viewportName + ": Roid Rage gain is independent of current happiness",
    jobPointGainAtHighHappy === jobPointGain, jobPointGain + " / " + jobPointGainAtHighHappy);
  await tab("session").click();
  await page.getByTestId("training-session-happy").fill("5025");
  await tab("enhancers").click();

  const statBookInputs = ["strength", "defense", "speed", "dexterity"].map(stat => page.getByTestId("training-book-" + stat));
  const allStatBooksEnabled = (await Promise.all(statBookInputs.map(input => input.isEnabled()))).every(Boolean);
  recordAssertion("Training Calculator " + viewportName + ": all four permanent stat books use live battle stats", allStatBooksEnabled);
  await page.getByTestId("training-se-stat-value").fill("9007199254740991");
  await page.getByTestId("training-book-strength").check();
  const permanentBookGain = await page.locator(".tc-stat-book-row").filter({ hasText: "Brawn Over Brains" }).locator(".tc-stat-book-gain").innerText();
  recordAssertion("Training Calculator " + viewportName + ": permanent stat book applies the 10M completion cap",
    permanentBookGain.includes("10,000,000"), permanentBookGain);
  recordAssertion("Training Calculator " + viewportName + ": E-DVD happiness remains in live auto mode",
    await page.getByTestId("training-dvd-happy").inputValue() === "auto", await page.getByTestId("training-dvd-happy").inputValue());
  recordAssertion("Training Calculator " + viewportName + ": SE model calculates two successive 1% increases", seGain.startsWith("+"), seGain);
  const seCost = await page.locator(".tc-metric").nth(2).locator("strong").innerText();
  recordAssertion("Training Calculator " + viewportName + ": SE market price is included", seCost === "$800,000,000", seCost);
  await noOverflow("Stat Enhancers");
  await scanAxe("Stat Enhancers");

  await tab("projection").click();
  await page.getByTestId("training-daily-energy").fill("480");
  await page.getByTestId("training-projection-days").fill("30");
  const projectedGain = (await page.locator(".tc-metric").first().locator("strong").innerText()).replaceAll(",", "").replace("+", "");
  recordAssertion("Training Calculator " + viewportName + ": 30-day projection calculates positive gains", Number(projectedGain) > 0, projectedGain);
  const projectionEnergy = await page.locator(".tc-metric").nth(2).locator("strong").innerText();
  recordAssertion("Training Calculator " + viewportName + ": projection accounts for 14,400E", projectionEnergy === "14,400", projectionEnergy);
  await noOverflow("long-term projection");
  await scanAxe("Long-term Projection");

  await page.screenshot({ path: path.join(artifactDir, "training-calculator-" + viewportName + "-projection.png"), fullPage: true, animations: "disabled" });
}

async function auditTrainingCalculatorEntry(browser) {
  const { context, page } = await createPage(browser, { width: 1440, height: 1000 });
  try {
    await page.goto(baseUrl + "/", { waitUntil: "networkidle" });
    const card = page.getByRole("button", { name: /Training Calculator/ });
    await card.waitFor({ state: "visible", timeout: 20000 });
    await card.click();
    await page.getByRole("heading", { name: /Train with a plan/ }).waitFor({ state: "visible", timeout: 20000 });
    const currentPath = new URL(page.url()).pathname;
    recordAssertion("Training Calculator: sixth workspace card opens the calculator route", currentPath === "/training-calculator", currentPath);
  } finally {
    await context.close();
  }
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
    await auditTrainingCalculatorEntry(browser);
    for (const viewportCase of [
      { name: "desktop", viewport: { width: 1440, height: 1000 } },
      { name: "tablet", viewport: { width: 768, height: 1024 } },
      { name: "mobile", viewport: { width: 390, height: 844 } },
      { name: "small-mobile", viewport: { width: 320, height: 720 } },
    ]) {
      for (const pageCase of [
        { name: "Christmas Town", path: "/christmas-town", selector: "christmas-town-year", heading: /Christmas Town/i },
        { name: "Halloween", path: "/halloween", selector: "halloween-year-scope", heading: /Halloween Dashboard/i },
        { name: "Training Calculator", path: "/training-calculator", selector: "training-tab-session", heading: /Train with a plan/i },
      ]) {
        const { context, page, state } = await createPage(browser, viewportCase.viewport);
        try {
          await auditLayout(page, pageCase.name, viewportCase.name, pageCase.path, pageCase.selector, pageCase.heading, state);
          if (pageCase.name === "Training Calculator") {
            await auditTrainingCalculatorInteractions(page, viewportCase.name);
          }
          if (viewportCase.name === "desktop" && pageCase.name === "Christmas Town") {
            const control = page.locator("#" + pageCase.selector);
            await control.selectOption(String(priorYear));
            await page.getByRole("heading", { name: "Minigames" }).waitFor({ state: "visible" });
            await page.waitForFunction((expected) => {
              const select = document.querySelector("#christmas-town-year");
              return select && select.value === expected;
            }, String(priorYear));
            const expectedFrom = priorYear + "-12-01";
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
            const control = page.locator("#" + pageCase.selector);
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
