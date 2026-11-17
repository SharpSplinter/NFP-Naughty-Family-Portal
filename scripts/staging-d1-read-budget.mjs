import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

const ACCOUNT_ID = "6c03b978ed9a59adc3f61c715bdad45c";
const mode = process.argv[2];
const pollIntervalMs = 15000;
const token = process.env.CLOUDFLARE_API_TOKEN || "";
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const statePath = process.env.D1_BUDGET_STATE_FILE || "";
const runBudgetRows = Number(process.env.D1_RUN_BUDGET_ROWS || 100000);
const dailyStopRows = Number(process.env.D1_DAILY_STOP_ROWS || 4000000);
const HARD_RUN_BUDGET_ROWS = 100000;
const HARD_DAILY_STOP_ROWS = 4000000;

assert.ok(mode === "start" || mode === "check" || mode === "watch", "Usage: node scripts/staging-d1-read-budget.mjs <start|check|watch -- <command> [args...]");
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

function readBudgetState() {
  if (!existsSync(statePath)) throw new Error("D1 budget baseline is missing. Refusing to accept an unmetered staging run.");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (state.accountId !== ACCOUNT_ID || state.utcDate !== today || state.runBudgetRows !== runBudgetRows || state.dailyStopRows !== dailyStopRows) {
    throw new Error("D1 budget baseline belongs to another account, UTC day, or budget profile.");
  }
  return state;
}

function assertBudget(currentRows, state, label) {
  const deltaRows = currentRows - state.baselineRowsRead;
  if (deltaRows < 0) throw new Error("D1 analytics total moved backwards. Refusing an unverifiable budget measurement.");
  console.log("D1 BUDGET " + label + " " + JSON.stringify({
    currentRowsReadToday: currentRows,
    baselineRowsRead: state.baselineRowsRead,
    rowsReadSinceStart: deltaRows,
    locallyMeteredWranglerRowsRead: Number(state.directRowsRead || 0),
    analyticsUnderreportsDirectReads: deltaRows < Number(state.directRowsRead || 0),
    perRunBudgetRows: state.runBudgetRows,
    dailyStopRows: state.dailyStopRows,
  }));
  if (currentRows >= state.dailyStopRows) {
    throw new Error("D1 daily safety stop reached: " + currentRows.toLocaleString("en-US") + " rows read today.");
  }
  if (Math.max(deltaRows, Number(state.directRowsRead || 0)) > state.runBudgetRows) {
    throw new Error("Hard per-run D1 read budget exceeded: " + deltaRows.toLocaleString("en-US") +
      " rows read by account analytics or direct Wrangler statements; maximum is " + state.runBudgetRows.toLocaleString("en-US") + ".");
  }
}

if (mode === "start") {
  if (existsSync(statePath)) throw new Error("D1 budget state already exists. Refusing to overwrite the run baseline.");
  const currentRows = await readAccountRows();
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
    directRowsRead: 0,
    directReadOperations: 0,
  };
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", { flag: "wx" });
  console.log("D1 BUDGET START " + JSON.stringify({
    baselineRowsRead: currentRows,
    perRunBudgetRows: runBudgetRows,
    dailyStopRows,
    reserveRowsBelowFreeTier: 1000000,
    utcDate: today,
  }));
} else if (mode === "check") {
  const state = readBudgetState();
  assertBudget(await readAccountRows(), state, "CHECK");
} else {
  const separator = process.argv.indexOf("--");
  const command = separator >= 0 ? process.argv[separator + 1] : "";
  const args = separator >= 0 ? process.argv.slice(separator + 2) : [];
  if (!command) throw new Error("watch mode requires -- followed by a command to run.");
  const state = readBudgetState();
  assertBudget(await readAccountRows(), state, "WATCH START");

  const child = spawn(command, args, {
    env: process.env,
    stdio: "inherit",
    detached: process.platform !== "win32",
  });
  const childExit = new Promise(resolve => {
    child.once("error", error => resolve({ error }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function stopChild() {
    try {
      if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    } catch {}
    const stopped = await new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), 5000);
      childExit.then(result => {
        clearTimeout(timer);
        resolve(result);
      });
    });
    if (stopped === null) {
      try {
        if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {}
      return await childExit;
    }
    return stopped;
  }

  let outcome;
  for (;;) {
    outcome = await new Promise(resolve => {
      const timer = setTimeout(() => resolve({ type: "poll" }), pollIntervalMs);
      childExit.then(result => {
        clearTimeout(timer);
        resolve({ type: "exit", result });
      });
    });
    if (outcome.type === "exit") break;
    try {
      assertBudget(await readAccountRows(), state, "WATCH");
    } catch (error) {
      const stopped = await stopChild();
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error("D1 budget watchdog stopped the selected feature test: " + detail +
        (stopped?.signal ? " (child signal " + stopped.signal + ")" : ""));
    }
  }
  if (outcome.result.error) throw outcome.result.error;
  if (outcome.result.code !== 0) {
    process.exitCode = outcome.result.code ?? 1;
    console.error("Selected staging feature exited with signal " + (outcome.result.signal ?? "unknown") + ".");
  } else {
    console.log("D1 budget watchdog completed selected feature within observed limits.");
  }
}
