import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseGymHistoryLog } from "../src/lib/gym-training/history.js";
import { estimateEnergyEquivalentGain } from "../src/lib/gym-training/gains.js";

const read = path => readFileSync(resolve(process.cwd(), path), "utf8");
const worker = read("src/worker/index.ts");
const migration = read("migrations/auth/0033_gym_training_history.sql");
const workspace = read("src/components/portal/workspaces.tsx");
const classifier = read("src/lib/gym-training/logs.ts");
const calculator = read("src/components/portal/training-calculator.tsx");

assert.ok(classifier.includes("const explicitGymTraining ="));

const userPerkMultiplier = 1.02 * 1.16 * 1.01 * 1.01;
const userTrainingEstimate = estimateEnergyEquivalentGain(
  "dexterity", 1091415897, 5025, 10, 7.3, userPerkMultiplier
);
assert.ok(userTrainingEstimate > 34000, "normalized 7.3 gym dots must be applied directly, not divided by ten twice");
assert.ok(Math.abs(userTrainingEstimate - 33777.88) / 33777.88 < 0.01,
  "the corrected estimate should closely track the supplied 10E dexterity train");
assert.ok(classifier.includes("const gymCategory ="));
assert.ok(classifier.includes("const trainingSignal ="));
assert.ok(classifier.includes("return gymCategory && trainingSignal"));
assert.ok(calculator.includes('import { estimateEnergyEquivalentGain } from "../../lib/gym-training/gains.js"'));
assert.ok(test.includes("userTrainingEstimate"), "the sample train regression must remain in the focused test");
assert.ok(calculator.includes('import { parseGymHistoryLog } from "../../lib/gym-training/history.js"'));
assert.ok(calculator.includes("details.statAfter"));

const parsedLog = parseGymHistoryLog({
  logId: "OTHKwCbOjctm4nFTQUmk",
  timestamp: 1794786328,
  title: "Gym train dexterity",
  record: {
    id: "OTHKwCbOjctm4nFTQUmk",
    timestamp: 1794786328,
    details: { id: 5303, title: "Gym train dexterity", category: "Gym" },
    data: {
      trains: 9,
      energy_used: 90,
      dexterity_before: "1091078227.1017",
      dexterity_after: 1091382128.5210853,
      dexterity_increased: 303901.4193850948,
      happy_used: 47,
      gym: 24
    },
    params: { color: "green", changed: 1591103100 }
  }
});
assert.deepEqual(parsedLog, {
  title: "Gym train dexterity",
  stat: "dexterity",
  energy: 90,
  gain: 303901.4193850948,
  statBefore: 1091078227.1017,
  statAfter: 1091382128.5210853,
  happyUsed: 47,
  gym: 24,
  trains: 9
});
assert.ok(calculator.includes("Before {fmt(details.statBefore, 2)}"));
assert.ok(worker.includes("const fetchGymCatalogue = async"));
assert.ok(worker.includes("const keys = [workerServiceTornApiKey(env), env.TORN_API_KEY_CUSTOM?.trim() || \"\"]"));
assert.ok(!worker.includes("const keys = [publicKey, env.TORN_API_KEY_CUSTOM?.trim() || \"\", memberKey]"));
assert.ok(worker.includes("delete errors.gymCatalogue"));
assert.ok(worker.includes('selection (HTTP " + response.status'));
assert.match(migration, /CREATE TABLE IF NOT EXISTS gym_training_historical_keys/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS gym_training_collection_jobs/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS gym_training_event_logs/);
assert.ok(migration.includes("PRIMARY KEY (player_id, log_id)"));
assert.ok(worker.includes('url.pathname === "/api/me/gym-training/key"'));
assert.ok(worker.includes('url.pathname === "/api/me/gym-training/collect"'));
assert.ok(worker.includes('url.pathname === "/api/me/gym-training/history"'));
assert.ok(worker.includes('SELECT historical_collection_enabled AS enabled FROM portal_user_consents'));
assert.ok(worker.includes('kind: "gym-training-log-collection"'));
assert.ok(worker.includes('Authorization: "ApiKey " + apiKey'));
assert.ok(worker.includes('INSERT OR IGNORE INTO gym_training_event_logs'));
assert.ok(worker.includes("runGymTrainingCollectionPage(env, halloweenJobId)"));
assert.ok(worker.includes("DELETE FROM gym_training_historical_keys WHERE player_id = ?"));
assert.ok(worker.includes("UPDATE gym_training_collection_jobs SET status = 'cancelled'"));
assert.ok(workspace.includes('request("/api/me/gym-training/key", "POST")'));
assert.ok(workspace.includes('request("/api/me/gym-training/collect", "POST")'));
assert.ok(workspace.includes('"/api/me/gym-training/history"'));
assert.ok(workspace.includes("Gym training history"));
assert.ok(workspace.includes("gym-training-history"));
console.log("PASS gym-training history classifier, central consent enforcement, member-key collection, idempotent storage, and onboarding integration");
