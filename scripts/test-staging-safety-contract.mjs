import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/deploy-staging-acceptance.yml", "utf8");
const feature = readFileSync("scripts/test-staging-features.mjs", "utf8");
const admin = readFileSync("scripts/test-staging-admin-acceptance.mjs", "utf8");
const budget = readFileSync("scripts/staging-d1-read-budget.mjs", "utf8");
const fixtures = readFileSync("scripts/staging-private-history-fixtures.mjs", "utf8");
const seed = readFileSync("scripts/seed-staging-private-history.mjs", "utf8");
const cleanup = readFileSync("scripts/cleanup-staging-private-history.mjs", "utf8");

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

assert.doesNotMatch(seed, /DELETE FROM\\s+players/i, "Seed must not delete parent player rows.");
assert.doesNotMatch(cleanup, /DELETE FROM\\s+players/i, "Cleanup must not invoke unbounded player foreign-key cascades.");
assert.match(fixtures, /event_year = 2026 AND player_id/);
assert.match(fixtures, /recordWranglerD1Metrics/);
assert.match(fixtures, /maximumRows <= 10000/);
assert.match(cleanup, /cleanup identity preflight/);
assert.match(seed, /fixture identity preflight/);
const infrastructureMutationSteps = [
  "Provision isolated staging Queues",
  "Apply pending migrations to staging D1 only",
  "Deploy isolated staging API Worker",
  "Deploy to the isolated naughtyfamily-staging Pages project",
];
for (const step of infrastructureMutationSteps) {
  const escaped = step.replace(/[.*+?^${}()|[\]\\]/g, "\\console.log("PASS staging safety contract:");
  assert.match(workflow, new RegExp("name: " + escaped + "\\n\\s+if: inputs\\.feature_suite != 'gym-training'"),
    step + " must be skipped for the harness-only Gym Training retest.");
}
assert.match(workflow, /name: Verify the staging Pages origin/);
assert.match(workflow, /name: Run exactly one selected feature suite/);
console.log("PASS staging safety contract: manual-only acceptance, one-feature selection, account-wide D1 hard budgets, no sustained load replay, and bounded admin smoke.");
