import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/deploy-staging-acceptance.yml", "utf8");
const feature = readFileSync("scripts/test-staging-features.mjs", "utf8");
const admin = readFileSync("scripts/test-staging-admin-acceptance.mjs", "utf8");
const budget = readFileSync("scripts/staging-d1-read-budget.mjs", "utf8");
const fixtures = readFileSync("scripts/staging-private-history-fixtures.mjs", "utf8");
const seed = readFileSync("scripts/seed-staging-private-history.mjs", "utf8");
const cleanup = readFileSync("scripts/cleanup-staging-private-history.mjs", "utf8");
const worker = readFileSync("src/worker/index.ts", "utf8");
const accounting = readFileSync("src/worker/d1-read-accounting.ts", "utf8");
const productionWorkerConfig = readFileSync("wrangler.toml", "utf8");
const stagingWorkerConfig = readFileSync("wrangler.acceptance.toml", "utf8");

assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /^\s{2}(?:push|pull_request):/m, "D1-backed acceptance must never run on pushes or pull requests.");
assert.match(workflow, /inputs\.feature_suite/);
assert.match(workflow, /Run exactly one selected feature suite/);
assert.match(workflow, /Start hard account-wide D1 rows-read budget/);
assert.match(workflow, /Enforce D1 rows-read budget before fixture seeding/);
assert.match(workflow, /steps\.staging_fixtures\.outcome != 'skipped'/, "Cleanup must not touch D1 when the budget preflight blocks the run.");
assert.match(workflow, /Enforce D1 rows-read budget after selected feature/);
assert.match(workflow, /Final D1 rows-read budget check after cleanup/);
assert.doesNotMatch(workflow, /test-staging-sustained-load\.mjs/, "Acceptance must not run the sustained D1 load test.");
assert.match(feature, /supportedSuites = new Set\(\["halloween", "christmas-town", "gym-training", "discord", "consent"\]\)/);
assert.match(feature, /full-suite runs are deliberately disabled/);
assert.match(budget, /HARD_RUN_BUDGET_ROWS = 100000/);
assert.match(budget, /HARD_DAILY_STOP_ROWS = 4000000/);
assert.match(budget, /Refusing staging without a measurable D1 budget/);
assert.match(budget, /Math\.max\(deltaRows, Number\(state\.directRowsRead \|\| 0\)\) > state\.runBudgetRows/);
assert.match(budget, /mode === "watch"/);
assert.ok(budget.includes('setTimeout(() => resolve({ type: "poll" }), pollIntervalMs)'), "The watchdog must poll D1 analytics while the selected feature is running.");
assert.match(budget, /D1 budget watchdog stopped the selected feature test/);
assert.match(workflow, /staging-d1-read-budget\.mjs watch -- node scripts\/test-staging-features\.mjs/);
assert.match(admin, /const adminEndpoints = \[\s*"\/api\/admin\/overview",\s*"\/api\/admin\/members\?limit=10",\s*"\/api\/admin\/data-governance\?limit=10"/);
assert.match(admin, /round < 1/);
assert.doesNotMatch(admin, /const sectionNames = \[/, "Admin smoke must not cycle all admin sections by default.");

assert.doesNotMatch(seed, /DELETE FROM\s+players/i, "Seed must not delete parent player rows.");
assert.doesNotMatch(cleanup, /DELETE FROM\s+players/i, "Cleanup must not invoke unbounded player foreign-key cascades.");
assert.match(fixtures, /event_year = 2026 AND player_id/);
assert.match(fixtures, /recordWranglerD1Metrics/);
assert.match(fixtures, /maximumRows <= 10000/);
assert.match(cleanup, /cleanup identity preflight/);
assert.match(seed, /fixture identity preflight/);

// Gym-only and cleanup-only runs must reuse the existing staging services.
for (const step of [
  "Provision isolated staging Queues",
  "Apply pending migrations to staging D1 only",
  "Deploy isolated staging API Worker",
  "Deploy to the isolated naughtyfamily-staging Pages project",
]) {
  const start = workflow.indexOf("      - name: " + step + "\n");
  assert.notEqual(start, -1, step + " must exist.");
  const next = workflow.indexOf("\n      - name: ", start + 1);
  const block = workflow.slice(start, next === -1 ? workflow.length : next);
  assert.match(block, /^        if: inputs\.feature_suite != 'gym-training' && inputs\.feature_suite != 'cleanup-only'$/m,
    step + " must be skipped for Gym-only and cleanup-only modes.");
}
assert.match(workflow, /- cleanup-only/);
assert.match(workflow, /fixture_created_at/);
assert.match(workflow, /- name: Verify the staging Pages origin/);
assert.match(workflow, /- name: Seed isolated authenticated private-history fixtures\n\s+if: inputs\.feature_suite != 'cleanup-only'/);
assert.match(workflow, /- name: Install Playwright Chromium for staging viewport checks\n\s+if: inputs\.feature_suite != 'cleanup-only'/);
assert.match(workflow, /- name: Run exactly one selected feature suite\n\s+if: inputs\.feature_suite != 'cleanup-only'/);
assert.match(workflow, /inputs\.feature_suite == 'cleanup-only'/);
assert.ok(workflow.includes("STAGING_FIXTURE_CREATED_AT=" + '"' + "$" + "{STAGING_CLEANUP_ONLY_CREATED_AT}" + '" node scripts/cleanup-staging-private-history.mjs'),
  "Cleanup-only must pass the exact supplied seed timestamp.");

// Direct Wrangler counters are the authoritative per-command read meter.
// Both fixture scripts must receive the same persistent state file as the
// analytics watchdog and cannot silently fall back to unmetered execution.
for (const step of [
  "Seed isolated authenticated private-history fixtures",
  "Remove synthetic private-history fixtures from staging D1",
]) {
  const start = workflow.indexOf("      - name: " + step + "\n");
  assert.notEqual(start, -1, step + " must exist.");
  const next = workflow.indexOf("\n      - name: ", start + 1);
  const block = workflow.slice(start, next === -1 ? workflow.length : next);
  assert.match(block, /D1_BUDGET_STATE_FILE:\s+\$\{\{\s*runner\.temp\s*\}\}\/ncd-d1-read-budget\.json/);
  assert.match(block, /D1_RUN_BUDGET_ROWS:\s+"100000"/);
}


assert.match(worker, /new D1RequestReadMeter\(\)/);
assert.match(worker, /eventType: "fetch"/);
assert.match(worker, /eventType: "queue"/);
assert.match(worker, /eventType: "scheduled"/);
assert.match(accounting, /meta\?\.\[snake\]/);
assert.match(accounting, /buildFirstRowSql\(sql\)/);
assert.match(accounting, /context\.waitUntil = \(promise\)/);
assert.match(accounting, /accountingStatus:/);
assert.match(accounting, /console\.log\(entry\)/, "D1 accounting must emit structured log objects, not JSON strings.");
assert.match(accounting, /unsupportedOperations/);
assert.match(productionWorkerConfig, /\[observability\]\s+enabled = true\s+head_sampling_rate = 1\.0/);
assert.match(stagingWorkerConfig, /\[observability\]\s+enabled = true\s+head_sampling_rate = 1\.0/);
console.log("PASS staging safety contract: manual-only acceptance, bounded direct Wrangler reads, shared run-budget state, indexed-only fixture cleanup, reserved identity preflight, no infrastructure mutations for Gym-only or cleanup-only runs, and complete-sampled Worker D1 accounting hooks for all event types.");
