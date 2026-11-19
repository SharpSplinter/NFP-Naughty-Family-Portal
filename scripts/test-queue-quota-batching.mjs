import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync("src/worker/index.ts", "utf8");
const floor = readFileSync("src/components/floor/floor-app.tsx", "utf8");

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, "Expected source range " + start);
  return source.slice(from, to);
}

assert.match(worker, /const HISTORICAL_LOG_PAGES_PER_QUEUE_MESSAGE = 8/);
assert.match(worker, /const GLOBAL_RANKING_PAGES_PER_QUEUE_MESSAGE = 6/);
assert.match(worker, /const maxPagesPerInvocation = GLOBAL_RANKING_PAGES_PER_QUEUE_MESSAGE/);

const gym = between(worker, "async function runGymTrainingCollectionPage(", "async function runHalloweenLiveSnapshot(");
assert.match(gym, /for \(let pagesProcessed = 0; pagesProcessed < HISTORICAL_LOG_PAGES_PER_QUEUE_MESSAGE/);
assert.equal((gym.match(/verifyFactionMembershipWithKey\(apiKey\)/g) ?? []).length, 1,
  "gym history batches must verify membership once, not once per API page");
assert.ok(gym.indexOf("UPDATE gym_training_collection_jobs SET status = \'running\', cursor_url")
  < gym.indexOf("await sendGymTrainingCollectionJob(env, jobId)"),
  "gym history cursor must be checkpointed before the next queue message is sent");
assert.match(gym, /INSERT OR IGNORE INTO gym_training_event_logs/);

const christmas = between(worker, "async function runChristmasTownLogCollectionPage(", "async function sendGymTrainingCollectionJob(");
assert.match(christmas, /for \(let pagesProcessed = 0; pagesProcessed < HISTORICAL_LOG_PAGES_PER_QUEUE_MESSAGE/);
assert.equal((christmas.match(/verifyFactionMembershipWithKey\(apiKey\)/g) ?? []).length, 1,
  "Christmas Town history batches must verify membership once per bounded batch");
assert.ok(christmas.indexOf("UPDATE christmas_town_collection_jobs SET status = \'running\', cursor_ts")
  < christmas.indexOf("await sendChristmasTownCollectionJob(env, jobId)"),
  "Christmas Town cursor must be checkpointed before the next queue message is sent");

const importedCard = between(floor, "Imported snapshot summary & live charts", "<LineChart title=\\"Daily company income\\"");
assert.match(floor, /const importedSummaryPoint = currentChartCompany\?\.history\.at\(-1\) \?\? null/);
assert.match(importedCard, /DAILY INCOME · IMPORTED/);
assert.match(importedCard, /WEEKLY PROFIT · IMPORTED/);
assert.match(importedCard, /STOCK QUANTITY · IMPORTED/);
assert.match(importedCard, /all summary values are as of \{importedSummaryPoint\.day\} UTC/);
assert.doesNotMatch(importedCard, /model\?\.company\.(dailyIncome|weeklyIncome)/);
assert.doesNotMatch(importedCard, /currentStockQuantity/);

console.log("PASS imported snapshot period coherence and bounded multi-page Queue collection");