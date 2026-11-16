import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ACCOUNT_ID = "6c03b978ed9a59adc3f61c715bdad45c";
const mode = process.argv[2];
const token = process.env.CLOUDFLARE_API_TOKEN || "";
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const statePath = process.env.D1_BUDGET_STATE_FILE || "";
const runBudgetRows = Number(process.env.D1_RUN_BUDGET_ROWS || 100000);
const dailyStopRows = Number(process.env.D1_DAILY_STOP_ROWS || 4000000);
const HARD_RUN_BUDGET_ROWS = 100000;
const HARD_DAILY_STOP_ROWS = 4000000;

assert.ok(mode === "start" || mode === "check", "Usage: node scripts/staging-d1-read-budget.mjs <start|check>");
assert.ok(token, "CLOUDFLARE_API_TOKEN is required for the D1 analytics budget guard.");
assert.equal(accountId, ACCOUNT_ID, "Refusing to inspect a different Cloudflare account.");
assert.ok(statePath, "D1_BUDGET_STATE_FILE is required.");
assert.ok(Number.isSafeInteger(runBudgetRows) && runBudgetRows > 0 && runBudgetRows <= HARD_RUN_BUDGET_ROWS,
  "The per-run D1 rows-read budget cannot exceed the hard 100,000-row ceiling.");
assert.ok(Number.isSafeInteger(dailyStopRows) && dailyStopRows > 0 && dailyStopRows <= HARD_DAILY_STOP_ROWS,
  "The account daily stop cannot exceed the hard 4,000,000-row ceiling.");

const today = new Date().toISOString().slice(0, 10);
const query = `query D1RowsReadUsage($accountTag: string!, $start: Date!, $end: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
        dimensions { date databaseId }
        sum { rowsRead }
      }
    }
  }
}`;

async function readAccountRows() {
  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ query, variables: { accountTag: ACCOUNT_ID, start: today, end: today } }),
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Cloudflare D1 analytics request failed with HTTP " + response.status + ".");
  if (Array.isArray(payload?.errors) && payload.errors.length) {
    throw new Error("Cloudflare D1 analytics permission/query failure: " + JSON.stringify(payload.errors).slice(0, 1200));
  }
  const accounts = payload?.data?.viewer?.accounts;
  if (!Array.isArray(accounts) || accounts.length !== 1) {
    throw new Error("Cloudflare returned no readable account analytics. Refusing staging without a measurable D1 budget.");
  }
  const groups = accounts[0]?.d1AnalyticsAdaptiveGroups;
  if (!Array.isArray(groups)) {
    throw new Error("Cloudflare returned no D1 analytics groups. Refusing staging without a measurable D1 budget.");
  }
  let total = 0;
  for (const group of groups) {
    if (group?.dimensions?.date !== today) continue;
    const value = Number(group?.sum?.rowsRead);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Cloudflare returned an invalid D1 rowsRead metric.");
    total += value;
  }
  if (!Number.isSafeInteger(total)) throw new Error("Account-wide D1 rowsRead total is outside the safe integer range.");
  return total;
}

const currentRows = await readAccountRows();
if (mode === "start") {
  if (existsSync(statePath)) throw new Error("D1 budget state already exists. Refusing to overwrite the run baseline.");
  if (currentRows >= dailyStopRows) {
    throw new Error("D1 daily safety stop reached before staging deployment: " + currentRows.toLocaleString("en-US") +
      " rows read today. Staging is blocked at the 4,000,000-row ceiling to preserve at least 1,000,000 rows below the 5M free-tier limit.");
  }
  const state = {
    accountId: ACCOUNT_ID,
    utcDate: today,
    baselineRowsRead: currentRows,
    runBudgetRows,
    dailyStopRows,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", { flag: "wx" });
  console.log("D1 BUDGET START " + JSON.stringify({
    baselineRowsRead: currentRows,
    perRunBudgetRows: runBudgetRows,
    dailyStopRows,
    reserveRowsBelowFreeTier: 1000000,
    utcDate: today,
  }));
} else {
  if (!existsSync(statePath)) throw new Error("D1 budget baseline is missing. Refusing to accept an unmetered staging run.");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (state.accountId !== ACCOUNT_ID || state.utcDate !== today || state.runBudgetRows !== runBudgetRows || state.dailyStopRows !== dailyStopRows) {
    throw new Error("D1 budget baseline belongs to another account, UTC day, or budget profile.");
  }
  const deltaRows = currentRows - state.baselineRowsRead;
  if (deltaRows < 0) throw new Error("D1 analytics total moved backwards. Refusing an unverifiable budget measurement.");
  console.log("D1 BUDGET CHECK " + JSON.stringify({
    currentRowsReadToday: currentRows,
    baselineRowsRead: state.baselineRowsRead,
    rowsReadSinceStart: deltaRows,
    perRunBudgetRows: state.runBudgetRows,
    dailyStopRows: state.dailyStopRows,
  }));
  if (currentRows >= state.dailyStopRows) {
    throw new Error("D1 daily safety stop reached: " + currentRows.toLocaleString("en-US") + " rows read today.");
  }
  if (deltaRows > state.runBudgetRows) {
    throw new Error("Hard per-run D1 read budget exceeded: " + deltaRows.toLocaleString("en-US") +
      " rows read since staging started; maximum is " + state.runBudgetRows.toLocaleString("en-US") + ".");
  }
}
