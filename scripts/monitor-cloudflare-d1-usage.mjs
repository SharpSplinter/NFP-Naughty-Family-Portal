#!/usr/bin/env node

import { appendFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const ACCOUNT_ID = "6c03b978ed9a59adc3f61c715bdad45c";
export const PRODUCTION_DATABASES = Object.freeze({
  "bbbe128a-c5cc-46ec-b8ef-93860183e795": "naughty-company-dashboard",
  "46f7536d-f69c-4304-8b44-615901c60b7c": "naughty-company-bot-production",
});

// These are the project's current Workers Free D1 daily limits. The quota
// window is UTC midnight-to-midnight, not a rolling 24-hour period.
export const DAILY_WRITE_LIMIT = 100_000;
export const DAILY_READ_LIMIT = 5_000_000;

export function summarizeD1Usage(records = []) {
  const databases = records.map((row) => ({
    databaseId: String(row.database_id ?? ""),
    databaseName: row.database_name || "unnamed database",
    rowsRead: Number(row.rows_read ?? 0),
    rowsWritten: Number(row.rows_written ?? 0),
    queries: Number(row.queries ?? 0),
  }));
  const sum = (items, key) => items.reduce((total, row) => total + row[key], 0);
  const production = databases.filter((row) => Object.hasOwn(PRODUCTION_DATABASES, row.databaseId));
  return {
    databases,
    rowsRead: sum(databases, "rowsRead"),
    rowsWritten: sum(databases, "rowsWritten"),
    queries: sum(databases, "queries"),
    productionRowsRead: sum(production, "rowsRead"),
    productionRowsWritten: sum(production, "rowsWritten"),
    productionQueries: sum(production, "queries"),
  };
}

export function classifyD1Usage({ rowsWritten = 0, rowsRead = 0 } = {}) {
  let writeStatus = "healthy";
  if (rowsWritten >= 95_000) writeStatus = "urgent";
  else if (rowsWritten >= 85_000) writeStatus = "critical";
  else if (rowsWritten >= 70_000) writeStatus = "warning";
  else if (rowsWritten >= 35_000) writeStatus = "elevated";

  let readStatus = "healthy";
  if (rowsRead >= 4_000_000) readStatus = "stop";
  else if (rowsRead >= 3_500_000) readStatus = "warning";

  return {
    writeStatus,
    readStatus,
    urgent: writeStatus === "urgent" || readStatus === "stop",
  };
}

export function rankWriteQueries(records = [], databaseNames = {}) {
  return records
    .map((row) => ({
      databaseId: String(row.database_id ?? ""),
      databaseName: databaseNames[String(row.database_id ?? "")] || "unknown database",
      executions: Number(row.executions ?? 0),
      estimatedRowsWritten: Number(row.rows_written ?? 0),
      query: String(row.query ?? "").replace(/\s+/g, " ").trim(),
    }))
    .filter((row) => row.estimatedRowsWritten > 0)
    .sort((a, b) => b.estimatedRowsWritten - a.estimatedRowsWritten);
}

function utcStartOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

function percent(value, limit) {
  return limit > 0 ? (value / limit * 100).toFixed(2) : "n/a";
}

function number(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function markdownCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

async function cloudflareGet(path, query, token) {
  const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) {
    const details = Array.isArray(payload?.errors)
      ? payload.errors.map((error) => error.message).filter(Boolean).join("; ")
      : "Cloudflare returned an invalid response.";
    throw new Error(`Cloudflare API ${response.status}: ${details || "request failed"}`);
  }
  return payload;
}

function renderReport({ now, today, yesterday, rolling24, previousRolling24, queries }) {
  const status = classifyD1Usage(today);
  const databaseNames = {
    ...PRODUCTION_DATABASES,
    ...Object.fromEntries(today.databases.map((row) => [row.databaseId, row.databaseName])),
  };
  const rankedQueries = rankWriteQueries(queries, databaseNames).slice(0, 10);
  const unexpectedWriters = today.databases.filter(
    (row) => !Object.hasOwn(PRODUCTION_DATABASES, row.databaseId) && row.rowsWritten > 0,
  );
  const lines = [
    "# Production D1 usage monitor",
    "",
    `- Measured at: **${now.toISOString()}**`,
    `- UTC daily quota window: ${utcStartOfDay(now)} through ${now.toISOString()}`,
    "- Quota comparison uses the UTC calendar day. Rolling 24-hour totals are shown separately and are not compared directly with the daily cap.",
    "- D1 Insights database totals are the authoritative account usage totals; per-query write counts are sampled attribution estimates and will not reconcile exactly.",
    "",
    "## Account-wide usage today",
    "",
    "| Metric | Used | Allowance | Consumed | Remaining |",
    "|---|---:|---:|---:|---:|",
    `| Rows written | ${number(today.rowsWritten)} | ${number(DAILY_WRITE_LIMIT)} | ${percent(today.rowsWritten, DAILY_WRITE_LIMIT)}% | ${number(Math.max(0, DAILY_WRITE_LIMIT - today.rowsWritten))} |`,
    `| Rows read | ${number(today.rowsRead)} | ${number(DAILY_READ_LIMIT)} | ${percent(today.rowsRead, DAILY_READ_LIMIT)}% | ${number(Math.max(0, DAILY_READ_LIMIT - today.rowsRead))} |`,
    "",
    `Production databases only: **${number(today.productionRowsWritten)} writes** and **${number(today.productionRowsRead)} reads**.`,
    "",
    "| Database | Rows written today | Rows read today | Queries |",
    "|---|---:|---:|---:|",
    ...today.databases
      .sort((a, b) => b.rowsWritten - a.rowsWritten)
      .map((row) => `| ${markdownCell(row.databaseName)} | ${number(row.rowsWritten)} | ${number(row.rowsRead)} | ${number(row.queries)} |`),
    "",
    "## Daily and rolling comparisons",
    "",
    "| Window | Rows written | Rows read |",
    "|---|---:|---:|",
    `| Previous UTC day | ${number(yesterday.rowsWritten)} | ${number(yesterday.rowsRead)} |`,
    `| Current rolling 24h | ${number(rolling24.rowsWritten)} | ${number(rolling24.rowsRead)} |`,
    `| Previous rolling 24h | ${number(previousRolling24.rowsWritten)} | ${number(previousRolling24.rowsRead)} |`,
    "",
    "## Largest write-producing SQL statements (estimated)",
    "",
    "| Database | Executions | Estimated rows written | SQL |",
    "|---|---:|---:|---|",
    ...(rankedQueries.length
      ? rankedQueries.map((row) =>
          `| ${markdownCell(row.databaseName)} | ${number(row.executions)} | ${number(row.estimatedRowsWritten)} | \`${markdownCell(row.query.slice(0, 220))}\` |`,
        )
      : ["| No attributed write statements returned | | | |"]),
    "",
    unexpectedWriters.length
      ? `**Unexpected non-production database writes:** ${unexpectedWriters.map((row) => `${row.databaseName}: ${number(row.rowsWritten)}`).join(", ")}.`
      : "No writes were reported for staging or other non-production databases.",
    "",
    `**Write status:** ${status.writeStatus.toUpperCase()}.`,
    `**Read status:** ${status.readStatus.toUpperCase()}.`,
    "",
    "This monitor uses the configured Workers Free D1 limits of 100,000 rows written and 5,000,000 rows read per UTC day. Confirm the account plan if it changes. The separate deployment run budget is not an additional daily allowance.",
    "",
  ];

  return { markdown: lines.join("\n"), status, rankedQueries, unexpectedWriters };
}

async function main() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("Missing CLOUDFLARE_API_TOKEN Actions secret.");

  const now = new Date();
  const until = now.toISOString();
  const todayStart = utcStartOfDay(now);
  const yesterdayStart = new Date(Date.parse(todayStart) - 86_400_000).toISOString();
  const rollingStart = new Date(now.getTime() - 86_400_000).toISOString();
  const previousRollingStart = new Date(now.getTime() - 172_800_000).toISOString();

  const databasesPath = "/d1/insights/databases";
  const queriesPath = "/d1/insights/queries";
  const [todayPayload, yesterdayPayload, rollingPayload, previousRollingPayload, queryPayload] =
    await Promise.all([
      cloudflareGet(databasesPath, { order_by: "rows_written", since: todayStart, until, limit: 1000 }, token),
      cloudflareGet(databasesPath, { order_by: "rows_written", since: yesterdayStart, until: todayStart, limit: 1000 }, token),
      cloudflareGet(databasesPath, { order_by: "rows_written", since: rollingStart, until, limit: 1000 }, token),
      cloudflareGet(databasesPath, { order_by: "rows_written", since: previousRollingStart, until: rollingStart, limit: 1000 }, token),
      cloudflareGet(queriesPath, { order_by: "executions", since: rollingStart, until, limit: 1000 }, token),
    ]);

  const today = summarizeD1Usage(todayPayload.result);
  const yesterday = summarizeD1Usage(yesterdayPayload.result);
  const rolling24 = summarizeD1Usage(rollingPayload.result);
  const previousRolling24 = summarizeD1Usage(previousRollingPayload.result);
  const report = renderReport({
    now,
    today,
    yesterday,
    rolling24,
    previousRolling24,
    queries: queryPayload.result,
  });

  console.log(report.markdown);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) await appendFile(summaryPath, report.markdown, "utf8");

  if (report.status.writeStatus === "urgent") {
    console.error("::error::URGENT: account-wide D1 writes have reached at least 95% of the daily allowance.");
  } else if (report.status.writeStatus === "critical") {
    console.error("::warning::CRITICAL: account-wide D1 writes have reached at least 85% of the daily allowance.");
  } else if (report.status.writeStatus === "warning") {
    console.error("::warning::D1 writes have reached at least 70% of the daily allowance.");
  } else if (report.status.writeStatus === "elevated") {
    console.error("::notice::D1 writes have exceeded the 35% elevated-usage threshold.");
  }

  if (report.status.readStatus === "stop") {
    console.error("::error::D1 reads have reached the 4,000,000-row hard stop.");
  } else if (report.status.readStatus === "warning") {
    console.error("::warning::D1 reads have reached the 3,500,000-row warning threshold.");
  }

  if (report.status.urgent) {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`D1 usage monitor failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
