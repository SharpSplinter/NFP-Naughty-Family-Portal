import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isGymTrainingLog } from "../src/lib/gym-training/logs";

const read = path => readFileSync(resolve(process.cwd(), path), "utf8");
const worker = read("src/worker/index.ts");
const migration = read("migrations/auth/0033_gym_training_history.sql");
const workspace = read("src/components/portal/workspaces.tsx");

assert.equal(isGymTrainingLog({
  id: "gym-1",
  timestamp: 1763000000,
  details: { title: "Gym training", category: "Gym" },
  data: { energy_used: 25 },
}), true);
assert.equal(isGymTrainingLog({
  id: "gym-2",
  timestamp: 1763000000,
  details: { title: "Training in the gym", category: "Other" },
  data: {},
}), true);
assert.equal(isGymTrainingLog({
  id: "gym-3",
  timestamp: 1763000000,
  details: { title: "Energy used", category: "Gym" },
  data: {},
}), true);
assert.equal(isGymTrainingLog({
  id: "gym-4",
  timestamp: 1763000000,
  details: { title: "Unlocked a new gym", category: "Gym" },
  data: {},
}), false);
assert.equal(isGymTrainingLog({
  id: "gym-5",
  timestamp: 1763000000,
  details: { title: "Used a gym item", category: "Items" },
  data: {},
}), false);
assert.equal(isGymTrainingLog(null), false);

assert.match(migration, /CREATE TABLE IF NOT EXISTS gym_training_historical_keys/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS gym_training_collection_jobs/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS gym_training_event_logs/);
assert.match(migration, /PRIMARY KEY \(player_id, log_id\)/);
assert.ok(worker.includes('url.pathname === "/api/me/gym-training/key"'));
assert.ok(worker.includes('url.pathname === "/api/me/gym-training/collect"'));
assert.ok(worker.includes('url.pathname === "/api/me/gym-training/history"'));
assert.ok(worker.includes('SELECT historical_collection_enabled AS enabled FROM portal_user_consents'));
assert.ok(worker.includes('kind: "gym-training-log-collection"'));
assert.ok(worker.includes('Authorization: "ApiKey " + apiKey'));
assert.ok(worker.includes('INSERT OR IGNORE INTO gym_training_event_logs'));
assert.ok(worker.includes('UPDATE gym_training_collection_jobs SET status = \'cancelled\''));
assert.ok(workspace.includes('request("/api/me/gym-training/key", "POST")'));
assert.ok(workspace.includes('request("/api/me/gym-training/collect", "POST")'));
assert.ok(workspace.includes('"/api/me/gym-training/history"'));
assert.ok(workspace.includes("Gym training history"));
assert.ok(workspace.includes("gym-training-history"));

console.log("PASS gym-training history classifier, central consent enforcement, member-key collection, idempotent storage, and onboarding integration");
