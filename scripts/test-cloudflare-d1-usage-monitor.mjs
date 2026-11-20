import assert from "node:assert/strict";
import {
  classifyD1Usage,
  rankWriteQueries,
  summarizeD1Usage,
} from "./monitor-cloudflare-d1-usage.mjs";

const rows = [
  {
    database_id: "bbbe128a-c5cc-46ec-b8ef-93860183e795",
    database_name: "naughty-company-dashboard",
    rows_read: 500,
    rows_written: 900,
    queries: 25,
  },
  {
    database_id: "46f7536d-f69c-4304-8b44-615901c60b7c",
    database_name: "naughty-company-bot-production",
    rows_read: 20,
    rows_written: 30,
    queries: 4,
  },
  {
    database_id: "02cca699-1232-495f-8a0a-de525058b92a",
    database_name: "naughtyfamily-acceptance-staging",
    rows_read: 100,
    rows_written: 70,
    queries: 2,
  },
];

const summary = summarizeD1Usage(rows);
assert.equal(summary.rowsRead, 620);
assert.equal(summary.rowsWritten, 1_000);
assert.equal(summary.queries, 31);
assert.equal(summary.productionRowsRead, 520);
assert.equal(summary.productionRowsWritten, 930);
assert.equal(summary.productionQueries, 29);

assert.equal(classifyD1Usage({ rowsWritten: 34_999, rowsRead: 0 }).writeStatus, "healthy");
assert.equal(classifyD1Usage({ rowsWritten: 35_000, rowsRead: 0 }).writeStatus, "elevated");
assert.equal(classifyD1Usage({ rowsWritten: 70_000, rowsRead: 0 }).writeStatus, "warning");
assert.equal(classifyD1Usage({ rowsWritten: 85_000, rowsRead: 0 }).writeStatus, "critical");
assert.equal(classifyD1Usage({ rowsWritten: 95_000, rowsRead: 0 }).writeStatus, "urgent");
assert.equal(classifyD1Usage({ rowsWritten: 0, rowsRead: 3_500_000 }).readStatus, "warning");
assert.equal(classifyD1Usage({ rowsWritten: 0, rowsRead: 4_000_000 }).readStatus, "stop");
assert.equal(classifyD1Usage({ rowsWritten: 95_000, rowsRead: 4_000_000 }).urgent, true);

const ranked = rankWriteQueries([
  { database_id: "d1", executions: 4, rows_written: 5, query: "INSERT A" },
  { database_id: "d1", executions: 2, rows_written: 18, query: "INSERT B" },
  { database_id: "d1", executions: 9, rows_written: 0, query: "SELECT C" },
], { d1: "test-db" });
assert.deepEqual(ranked.map((row) => row.estimatedRowsWritten), [18, 5]);
assert.equal(ranked[0].databaseName, "test-db");

console.log("Cloudflare D1 usage monitor tests passed.");
