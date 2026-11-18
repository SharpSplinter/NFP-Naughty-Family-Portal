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
assert.doesNotMatch(restoreWorkflow, /7z x|p7zip/, "The restore workflow must use the new GPG encrypted backup format.");
assert.ok(!restoreWorkflow.includes("cloudflare/wrangler-action@v4") && !restoreWorkflow.includes("api.cloudflare.com"),
  "The offline restore rehearsal must not call Cloudflare or D1.");
assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /^\s{2}(?:push|pull_request):/m, "Production deployment must remain manual-only.");
assert.match(workflow, /environment:\s+name: production/, "Production deployment must use the protected GitHub Environment.");
assert.match(workflow, /inputs\.release_authorization/);
assert.match(workflow, /inputs\.queue_configuration_ack/);
assert.match(workflow, /inputs\.backup_sha256/);
assert.match(workflow, /inputs\.d1_usage_checked_at/);
assert.match(workflow, /inputs\.restore_rehearsal_run_url/);
assert.match(workflow, /inputs\.staging_acceptance_run_url/);
assert.match(workflow, /inputs\.staging_acceptance_commit/);
assert.match(workflow, /inputs\.staging_acceptance_evidence_reference/);
assert.match(restoreWorkflow, /github\.ref == 'refs\/heads\/main'/, "The local-only restore rehearsal must support exact main release commits.");
const preflightPosition = workflow.indexOf("node scripts/production-cutover-preflight.mjs");
const firstCloudflarePosition = workflow.indexOf("uses: cloudflare/wrangler-action@v4");
assert.ok(preflightPosition >= 0 && firstCloudflarePosition > preflightPosition,
  "Evidence preflight must run before the first Cloudflare action.");
assert.match(workflow, /confirm_target == 'naughtyfamily-api'/);

const now = new Date("2026-11-17T04:00:00.000Z");
const candidate = "8e34071abe0f570a171cfe919ddbc16a92b689ab";
const stagingRuntimeCommit = "f25c2980d186124441baf84184e90a3942b25ef4";
const release = "451869f0ae3ba7ae37aeca4d15ac34680d74ab6c";
const treeSha = "a".repeat(40);
const stagingTreeSha = "b".repeat(40);
const stagingEvidenceReference = "https://github.com/SharpSplinter/Naughty-Company-Dashboard/blob/main/docs/audits/2026-11-17-pr152-bounded-staging-acceptance.md";
const stagingEvidence = [
  "# PR #152 bounded staging acceptance",
  `Runtime source SHA: \`${stagingRuntimeCommit}\``,
  "268 D1 rows read",
  "0 D1 rows written",
  "3 billable Queue operations",
  "1 synthetic no-op message",
  "DLQ messages: 0",
  "No production D1, Worker, Pages, Torn, or Queue resource was accessed.",
].join("\n");

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
    RESTORE_REHEARSAL_COMMIT: candidate,
    STAGING_ACCEPTANCE_RUN_URL: "https://github.com/SharpSplinter/Naughty-Company-Dashboard/actions/runs/105",
    STAGING_ACCEPTANCE_COMMIT: stagingRuntimeCommit,
    STAGING_ACCEPTANCE_EVIDENCE_REFERENCE: stagingEvidenceReference,
    CANDIDATE_COMMIT: candidate,
    GITHUB_REPOSITORY: "SharpSplinter/Naughty-Company-Dashboard",
    GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: release,
    GITHUB_TOKEN: "test-token",
  };
}

const env = validEnv();
assert.deepEqual(validateProductionCutoverInputs(env, now).errors, []);

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

const invalidStagingCommit = validEnv();
invalidStagingCommit.STAGING_ACCEPTANCE_COMMIT = "not-a-full-sha";
assert.ok(validateProductionCutoverInputs(invalidStagingCommit, now).errors.some(x => x.includes("full SHA deployed and exercised in staging")));

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const successfulRun = {
  status: "completed",
  conclusion: "success",
  event: "workflow_dispatch",
  head_branch: "portal-rebuild",
  head_sha: candidate,
  repository: { full_name: "SharpSplinter/Naughty-Company-Dashboard" },
};

const fakeFetch = async url => {
  const value = String(url);
  if (value.endsWith("/actions/runs/104")) {
    return response({ ...successfulRun, path: ".github/workflows/restore-production-backup-rehearsal.yml" });
  }
  if (value.endsWith("/actions/runs/105")) {
    return response({
      ...successfulRun,
      head_sha: stagingRuntimeCommit,
      path: ".github/workflows/worker-build-artifact.yml",
    });
  }
  if (value.endsWith(`/commits/${candidate}`) || value.endsWith(`/commits/${release}`) || value.endsWith(`/commits/${stagingRuntimeCommit}`)) {
    return response({ commit: { tree: { sha: value.endsWith(stagingRuntimeCommit) ? stagingTreeSha : treeSha } } });
  }
  if (value.endsWith(`/git/trees/${treeSha}?recursive=1`)) {
    return response({
      truncated: false,
      tree: [
        { path: "src/worker/index.ts", type: "blob", sha: "runtime-unchanged" },
        { path: ".github/workflows/restore-production-backup-rehearsal.yml", type: "blob", sha: "restore-new" },
      ],
    });
  }
  if (value.endsWith(`/git/trees/${stagingTreeSha}?recursive=1`)) {
    return response({
      truncated: false,
      tree: [
        { path: "src/worker/index.ts", type: "blob", sha: "runtime-unchanged" },
        { path: ".github/workflows/restore-production-backup-rehearsal.yml", type: "blob", sha: "restore-old" },
      ],
    });
  }
  if (value === "https://raw.githubusercontent.com/SharpSplinter/Naughty-Company-Dashboard/main/docs/audits/2026-11-17-pr152-bounded-staging-acceptance.md") {
    return new Response(stagingEvidence, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return response({ message: "not found" }, 404);
};

const verified = await verifyProductionCutoverEvidence(env, fakeFetch, now);
assert.equal(verified.candidateCommit, candidate);
assert.equal(verified.releaseCommit, release);
assert.equal(verified.treeSha, treeSha);
assert.equal(verified.stagingAcceptanceCommit, stagingRuntimeCommit);
assert.equal(verified.stagingTreeSha, stagingTreeSha);
assert.deepEqual(verified.stagingRuntimeEquivalentFiles, [".github/workflows/restore-production-backup-rehearsal.yml"]);
assert.equal(verified.d1RowsRead, 3500000);

const failedAcceptanceFetch = async url => {
  if (String(url).endsWith("/actions/runs/105")) {
    return response({
      ...successfulRun,
      head_sha: stagingRuntimeCommit,
      conclusion: "failure",
      path: ".github/workflows/worker-build-artifact.yml",
    });
  }
  return fakeFetch(url);
};
await assert.rejects(
  verifyProductionCutoverEvidence(env, failedAcceptanceFetch, now),
  /Staging Worker deployment must be a completed successful/
);

const changedRuntimeFetch = async url => {
  if (String(url).endsWith(`/git/trees/${stagingTreeSha}?recursive=1`)) {
    return response({
      truncated: false,
      tree: [
        { path: "src/worker/index.ts", type: "blob", sha: "runtime-old" },
        { path: ".github/workflows/restore-production-backup-rehearsal.yml", type: "blob", sha: "restore-old" },
      ],
    });
  }
  return fakeFetch(url);
};
await assert.rejects(
  verifyProductionCutoverEvidence(env, changedRuntimeFetch, now),
  /Staging runtime equivalence check failed/
);

const incompleteEvidenceFetch = async url => {
  if (String(url).includes("2026-11-17-pr152-bounded-staging-acceptance.md")) {
    return new Response(stagingEvidence.replace("0 D1 rows written", "1 D1 row written"), { status: 200 });
  }
  return fakeFetch(url);
};
await assert.rejects(
  verifyProductionCutoverEvidence(env, incompleteEvidenceFetch, now),
  /Committed bounded staging acceptance evidence is incomplete/
);

const mismatchedTreeFetch = async url => {
  if (String(url).endsWith(`/commits/${release}`)) {
    return response({ commit: { tree: { sha: "c".repeat(40) } } });
  }
  return fakeFetch(url);
};
await assert.rejects(
  verifyProductionCutoverEvidence(env, mismatchedTreeFetch, now),
  /Git tree does not exactly match/
);

console.log("PASS production cutover preflight: evidence references, backup and usage freshness, D1 reserve, explicit acknowledgements, exact restore commit, bounded staging evidence, allowed runtime-equivalent changes, and matching release tree.");
