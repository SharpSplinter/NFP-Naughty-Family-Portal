import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateProductionCutoverInputs,
  verifyProductionCutoverEvidence,
} from "./production-cutover-preflight.mjs";

const workflow = readFileSync(".github/workflows/worker-deploy.yml", "utf8");
const restoreWorkflow = readFileSync(".github/workflows/restore-production-backup-rehearsal.yml", "utf8");
assert.match(restoreWorkflow, /workflow_dispatch:/);
assert.match(restoreWorkflow, /environment:\s+name: production-backup/);
assert.match(restoreWorkflow, /PRODUCTION_D1_BACKUP_URL/);
assert.match(restoreWorkflow, /PRODUCTION_D1_BACKUP_PASSWORD/);
assert.match(restoreWorkflow, /GPG AES-256|gpg/i);
assert.match(restoreWorkflow, /tar -xzf/);
assert.match(restoreWorkflow, /SQL_EXPORT_SHA256/);
assert.match(restoreWorkflow, /replay-production-backup-migrations.py/);
assert.doesNotMatch(restoreWorkflow, /7z x|p7zip/);
assert.ok(!restoreWorkflow.includes("cloudflare/wrangler-action@v4") && !restoreWorkflow.includes("api.cloudflare.com"),
  "The offline restore rehearsal must not call Cloudflare or D1.");
assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /^\s{2}(?:push|pull_request):/m, "Production deployment must remain manual-only.");
assert.match(workflow, /environment:\s+name: production/);
assert.match(workflow, /inputs\.release_authorization/);
assert.match(workflow, /inputs\.queue_configuration_ack/);
assert.match(workflow, /inputs\.backup_sha256/);
assert.match(workflow, /inputs\.d1_usage_checked_at/);
assert.match(workflow, /inputs\.restore_rehearsal_run_url/);
assert.match(workflow, /inputs\.restore_rehearsal_commit/);
assert.doesNotMatch(workflow, /staging_acceptance|STAGING_ACCEPTANCE|worker-build-artifact/);
assert.ok(restoreWorkflow.includes("github.ref == 'refs/heads/main'"));
const preflightPosition = workflow.indexOf("node scripts/production-cutover-preflight.mjs");
const firstCloudflarePosition = workflow.indexOf("uses: cloudflare/wrangler-action@v4");
assert.ok(preflightPosition >= 0 && firstCloudflarePosition > preflightPosition,
  "Evidence preflight must run before the first Cloudflare action.");
assert.match(workflow, /confirm_target == 'naughtyfamily-api'/);

const now = new Date("2026-11-17T04:00:00.000Z");
const candidate = "a".repeat(40);
const release = "f".repeat(40);
const restoreCommitSha = "b".repeat(40);
const treeSha = "c".repeat(40);
const restoreTreeSha = "d".repeat(40);

function validEnv() {
  return {
    CONFIRM_TARGET: "naughtyfamily-api",
    RELEASE_AUTHORIZATION: "I approve production D1 migrations and Worker deployment",
    QUEUE_CONFIGURATION_ACK: "I approve reconciliation of configured Queue bindings",
    BACKUP_REFERENCE: "https://backup.example.invalid/ncd/prod-2026-11-17.enc",
    BACKUP_SHA256: "b".repeat(64),
    BACKUP_CREATED_AT: "2026-11-17T03:00:00.000Z",
    TIME_TRAVEL_BOOKMARK_REFERENCE: "https://dash.cloudflare.com/example/d1/bookmark/abc",
    D1_LEDGER_REFERENCE: "https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/100",
    D1_USAGE_REFERENCE: "https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/101",
    D1_USAGE_CHECKED_AT: "2026-11-17T03:55:00.000Z",
    D1_ROWS_READ: "3500000",
    D1_HARD_STOP_ROWS: "4000000",
    D1_RELEASE_RESERVE_ROWS: "100000",
    SERVICE_KEY_PERMISSION_REFERENCE: "https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/102",
    QUEUE_CONFIGURATION_REVIEW_REFERENCE: "https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/103",
    RESTORE_REHEARSAL_RUN_URL: "https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/104",
    RESTORE_REHEARSAL_COMMIT: restoreCommitSha,
    CANDIDATE_COMMIT: candidate,
    GITHUB_REPOSITORY: "SharpSplinter/Naughty-Company-Dashboard",
    GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: release,
    GITHUB_TOKEN: "test-token",
  };
}

assert.deepEqual(validateProductionCutoverInputs(validEnv(), now).errors, []);

const staleBackup = validEnv();
staleBackup.BACKUP_CREATED_AT = "2026-11-15T03:00:00.000Z";
assert.ok(validateProductionCutoverInputs(staleBackup, now).errors.some(x => x.includes("backup creation time is too old")));

const staleUsage = validEnv();
staleUsage.D1_USAGE_CHECKED_AT = "2026-11-17T03:40:00.000Z";
assert.ok(validateProductionCutoverInputs(staleUsage, now).errors.some(x => x.includes("D1 usage check time is too old")));

const exhaustedBudget = validEnv();
exhaustedBudget.D1_ROWS_READ = "3950000";
assert.ok(validateProductionCutoverInputs(exhaustedBudget, now).errors.some(x => x.includes("exceed the declared hard stop")));

const badChecksum = validEnv();
badChecksum.BACKUP_SHA256 = "not-a-sha";
assert.ok(validateProductionCutoverInputs(badChecksum, now).errors.some(x => x.includes("64 hexadecimal")));

const badTarget = validEnv();
badTarget.CONFIRM_TARGET = "naughty-company-api";
assert.ok(validateProductionCutoverInputs(badTarget, now).errors.some(x => x.includes("naughtyfamily-api")));

const missingQueueApproval = validEnv();
missingQueueApproval.QUEUE_CONFIGURATION_ACK = "";
assert.ok(validateProductionCutoverInputs(missingQueueApproval, now).errors.some(x => x.includes("Queue bindings")));

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const successfulRestoreRun = {
  status: "completed",
  conclusion: "success",
  event: "workflow_dispatch",
  head_branch: "main",
  head_sha: restoreCommitSha,
  repository: { full_name: "SharpSplinter/Naughty-Company-Dashboard" },
  path: ".github/workflows/restore-production-backup-rehearsal.yml",
};

const fakeFetch = async url => {
  const value = String(url);
  if (value.endsWith("/actions/runs/104")) return jsonResponse(successfulRestoreRun);
  if (value.endsWith("/commits/" + candidate) || value.endsWith("/commits/" + release)) {
    return jsonResponse({ commit: { tree: { sha: treeSha } } });
  }
  if (value.endsWith("/commits/" + restoreCommitSha)) {
    return jsonResponse({ commit: { tree: { sha: restoreTreeSha } } });
  }
  if (value.endsWith("/git/trees/" + treeSha + "?recursive=1")) {
    return jsonResponse({
      truncated: false,
      tree: [
        { path: "src/worker/index.ts", type: "blob", sha: "runtime-current" },
        { path: "migrations/auth/0037_latest.sql", type: "blob", sha: "migration-current" },
        { path: "scripts/replay-production-backup-migrations.py", type: "blob", sha: "replay-current" },
      ],
    });
  }
  if (value.endsWith("/git/trees/" + restoreTreeSha + "?recursive=1")) {
    return jsonResponse({
      truncated: false,
      tree: [
        { path: "migrations/auth/0037_latest.sql", type: "blob", sha: "migration-current" },
        { path: "scripts/replay-production-backup-migrations.py", type: "blob", sha: "replay-current" },
      ],
    });
  }
  return jsonResponse({ message: "not found" }, 404);
};

const verified = await verifyProductionCutoverEvidence(validEnv(), fakeFetch, now);
assert.equal(verified.candidateCommit, candidate);
assert.equal(verified.releaseCommit, release);
assert.equal(verified.treeSha, treeSha);
assert.equal(verified.restoreRehearsalCommit, restoreCommitSha);
assert.equal(verified.restoreMigrationReplayFilesCompared, 2);
assert.equal(verified.d1RowsRead, 3500000);

const failedRestoreFetch = async url => {
  if (String(url).endsWith("/actions/runs/104")) {
    return jsonResponse({ ...successfulRestoreRun, conclusion: "failure" });
  }
  return fakeFetch(url);
};
await assert.rejects(
  verifyProductionCutoverEvidence(validEnv(), failedRestoreFetch, now),
  /Production-data restore rehearsal must be a completed successful/,
);

const mismatchedTreeFetch = async url => {
  if (String(url).endsWith("/commits/" + release)) {
    return jsonResponse({ commit: { tree: { sha: "e".repeat(40) } } });
  }
  return fakeFetch(url);
};
await assert.rejects(
  verifyProductionCutoverEvidence(validEnv(), mismatchedTreeFetch, now),
  /Git tree does not exactly match/,
);

const changedMigrationFetch = async url => {
  if (String(url).endsWith("/git/trees/" + restoreTreeSha + "?recursive=1")) {
    return jsonResponse({
      truncated: false,
      tree: [
        { path: "migrations/auth/0037_latest.sql", type: "blob", sha: "migration-stale" },
        { path: "scripts/replay-production-backup-migrations.py", type: "blob", sha: "replay-current" },
      ],
    });
  }
  return fakeFetch(url);
};
await assert.rejects(
  verifyProductionCutoverEvidence(validEnv(), changedMigrationFetch, now),
  /Restore rehearsal is stale; migration\/replay files changed after it ran/,
);

console.log("PASS production cutover preflight: production authorization, backup checksum/freshness, D1 usage freshness and reserve, queue authorization, restore rehearsal, candidate/main tree identity, and unchanged restore migration/replay files.");
