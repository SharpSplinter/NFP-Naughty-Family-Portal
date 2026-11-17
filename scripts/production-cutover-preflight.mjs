import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const REPOSITORY = "SharpSplinter/Naughty-Company-Dashboard";
const HEX_40 = /^[a-f0-9]{40}$/i;
const HEX_64 = /^[a-f0-9]{64}$/i;
const MAX_BACKUP_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_D1_USAGE_AGE_MS = 15 * 60 * 1000;
const REQUIRED_RELEASE_ACK = "I approve production D1 migrations and Worker deployment";
const REQUIRED_QUEUE_ACK = "I approve reconciliation of configured Queue bindings";

function parseHttpsReference(value, name, errors) {
  try {
    const parsed = new URL(String(value ?? ""));
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error("not an acceptable HTTPS reference");
    }
    return parsed;
  } catch {
    errors.push(`${name} must be a valid HTTPS reference.`);
    return null;
  }
}

function parseTimestamp(value, name, nowMs, maxAgeMs, errors) {
  const parsed = Date.parse(String(value ?? ""));
  if (!Number.isFinite(parsed)) {
    errors.push(`${name} must be a valid ISO-8601 timestamp.`);
    return null;
  }
  if (parsed > nowMs + 60_000) errors.push(`${name} cannot be in the future.`);
  if (nowMs - parsed > maxAgeMs) errors.push(`${name} is too old for production cutover.`);
  return parsed;
}

function runIdFromReference(value, name, errors) {
  const match = String(value ?? "").match(
    /^https:\/\/github\.com\/SharpSplinter\/Naughty-Company-Dashboard\/actions\/runs\/(\d+)\/?$/
  );
  if (!match) {
    errors.push(`${name} must be a GitHub Actions run URL in this repository.`);
    return null;
  }
  return match[1];
}

export function validateProductionCutoverInputs(env, now = new Date()) {
  const errors = [];
  const nowMs = now.getTime();

  if (env.CONFIRM_TARGET !== "naughtyfamily-api") {
    errors.push("The production API target must be explicitly confirmed as naughtyfamily-api.");
  }
  if (env.RELEASE_AUTHORIZATION !== REQUIRED_RELEASE_ACK) {
    errors.push("Explicit production D1 migration and Worker deployment authorization is required.");
  }
  if (env.QUEUE_CONFIGURATION_ACK !== REQUIRED_QUEUE_ACK) {
    errors.push("Explicit review and authorization of the production Queue bindings is required.");
  }

  parseHttpsReference(env.BACKUP_REFERENCE, "Encrypted backup reference", errors);
  if (!HEX_64.test(String(env.BACKUP_SHA256 ?? ""))) {
    errors.push("BACKUP_SHA256 must contain exactly 64 hexadecimal characters.");
  }
  parseTimestamp(env.BACKUP_CREATED_AT, "Encrypted backup creation time", nowMs, MAX_BACKUP_AGE_MS, errors);
  parseHttpsReference(env.TIME_TRAVEL_BOOKMARK_REFERENCE, "Time Travel bookmark reference", errors);
  parseHttpsReference(env.D1_LEDGER_REFERENCE, "Production D1 migration-ledger reference", errors);
  parseHttpsReference(env.D1_USAGE_REFERENCE, "Account-wide D1 usage evidence reference", errors);
  parseTimestamp(env.D1_USAGE_CHECKED_AT, "D1 usage check time", nowMs, MAX_D1_USAGE_AGE_MS, errors);
  parseHttpsReference(env.SERVICE_KEY_PERMISSION_REFERENCE, "Service-key permission evidence reference", errors);
  parseHttpsReference(env.QUEUE_CONFIGURATION_REVIEW_REFERENCE, "Queue configuration review reference", errors);

  const rowsRead = Number(env.D1_ROWS_READ);
  const hardStop = Number(env.D1_HARD_STOP_ROWS);
  const reserve = Number(env.D1_RELEASE_RESERVE_ROWS);
  if (!Number.isSafeInteger(rowsRead) || rowsRead < 0) {
    errors.push("D1_ROWS_READ must be a non-negative integer from the fresh account-wide usage check.");
  }
  if (!Number.isSafeInteger(hardStop) || hardStop < 1) {
    errors.push("D1_HARD_STOP_ROWS must be a positive integer matching the account's daily hard stop.");
  }
  if (!Number.isSafeInteger(reserve) || reserve < 1) {
    errors.push("D1_RELEASE_RESERVE_ROWS must be a positive integer reserved for the deployment window.");
  }
  if (
    Number.isSafeInteger(rowsRead) && rowsRead >= 0 &&
    Number.isSafeInteger(hardStop) && hardStop > 0 &&
    Number.isSafeInteger(reserve) && reserve > 0 &&
    rowsRead + reserve > hardStop
  ) {
    errors.push("Current D1 reads plus the reserved deployment budget exceed the declared hard stop.");
  }

  const candidateCommit = String(env.CANDIDATE_COMMIT ?? "");
  if (!HEX_40.test(candidateCommit)) errors.push("CANDIDATE_COMMIT must be a full 40-character Git commit SHA.");
  if (env.GITHUB_REPOSITORY !== REPOSITORY) errors.push("This workflow must run in the canonical repository.");
  if (env.GITHUB_REF !== "refs/heads/main") errors.push("Production deployment is allowed only from main.");
  if (!HEX_40.test(String(env.GITHUB_SHA ?? ""))) errors.push("GITHUB_SHA must identify the main release commit.");
  if (!String(env.GITHUB_TOKEN ?? "").trim()) errors.push("GITHUB_TOKEN is required for read-only evidence verification.");

  const restoreRunId = runIdFromReference(env.RESTORE_REHEARSAL_RUN_URL, "Restore rehearsal reference", errors);
  const stagingRunId = runIdFromReference(env.STAGING_ACCEPTANCE_RUN_URL, "Stateful staging acceptance reference", errors);
  if (candidateCommit && HEX_40.test(candidateCommit)) {
    if (String(env.RESTORE_REHEARSAL_COMMIT ?? "").toLowerCase() !== candidateCommit.toLowerCase()) {
      errors.push("The restore rehearsal must identify the exact candidate commit.");
    }
    if (String(env.STAGING_ACCEPTANCE_COMMIT ?? "").toLowerCase() !== candidateCommit.toLowerCase()) {
      errors.push("Stateful staging acceptance must identify the exact candidate commit.");
    }
  }

  return {
    errors,
    candidateCommit,
    restoreRunId,
    stagingRunId,
  };
}

async function githubJson(url, token, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub evidence lookup failed with HTTP ${response.status}.`);
  return response.json();
}

function validateRun(run, expectedSha, label, expectedWorkflowPath) {
  if (run.status !== "completed" || run.conclusion !== "success") {
    throw new Error(`${label} must be a completed successful GitHub Actions run.`);
  }
  if (run.repository?.full_name !== REPOSITORY) {
    throw new Error(`${label} must originate from the canonical repository.`);
  }
  if (run.path !== expectedWorkflowPath) {\n    throw new Error(`${label} must use ${expectedWorkflowPath}.`);\n  }\n  if (run.event !== "workflow_dispatch") {
    throw new Error(`${label} must be an explicitly dispatched workflow run.`);
  }
  if (run.head_sha?.toLowerCase() !== expectedSha.toLowerCase()) {
    throw new Error(`${label} did not test the declared candidate commit.`);
  }
  if (run.head_branch !== "portal-rebuild" && run.head_branch !== "main") {
    throw new Error(`${label} must run from portal-rebuild or main.`);
  }
}

export async function verifyProductionCutoverEvidence(env, fetchImpl = fetch, now = new Date()) {
  const parsed = validateProductionCutoverInputs(env, now);
  if (parsed.errors.length) {
    throw new Error(`Production cutover preflight rejected:\n- ${parsed.errors.join("\n- ")}`);
  }

  const apiRoot = `https://api.github.com/repos/${REPOSITORY}`;
  const [restoreRun, stagingRun, candidateCommit, releaseCommit] = await Promise.all([
    githubJson(`${apiRoot}/actions/runs/${parsed.restoreRunId}`, env.GITHUB_TOKEN, fetchImpl),
    githubJson(`${apiRoot}/actions/runs/${parsed.stagingRunId}`, env.GITHUB_TOKEN, fetchImpl),
    githubJson(`${apiRoot}/commits/${parsed.candidateCommit}`, env.GITHUB_TOKEN, fetchImpl),
    githubJson(`${apiRoot}/commits/${env.GITHUB_SHA}`, env.GITHUB_TOKEN, fetchImpl),
  ]);

  validateRun(restoreRun, parsed.candidateCommit, "Production-data restore rehearsal", ".github/workflows/restore-production-backup-rehearsal.yml");
  validateRun(stagingRun, parsed.candidateCommit, "Stateful staging acceptance", ".github/workflows/deploy-staging-acceptance.yml");

  const candidateTree = candidateCommit.commit?.tree?.sha;
  const releaseTree = releaseCommit.commit?.tree?.sha;
  if (!candidateTree || !releaseTree || candidateTree !== releaseTree) {
    throw new Error("The tested candidate's Git tree does not exactly match the main release commit.");
  }

  return {
    candidateCommit: parsed.candidateCommit,
    releaseCommit: env.GITHUB_SHA,
    treeSha: releaseTree,
    restoreRunId: parsed.restoreRunId,
    stagingRunId: parsed.stagingRunId,
    d1RowsRead: Number(env.D1_ROWS_READ),
    d1ReleaseReserveRows: Number(env.D1_RELEASE_RESERVE_ROWS),
    d1HardStopRows: Number(env.D1_HARD_STOP_ROWS),
  };
}

async function main() {
  const result = await verifyProductionCutoverEvidence(process.env);
  const summary = [
    "## Production cutover evidence preflight",
    "",
    "- Explicit production target and release acknowledgement: passed",
    "- Encrypted backup reference, SHA-256 format, and freshness: passed (archive bytes remain externally stored and are not downloaded by this workflow)",
    "- Time Travel bookmark and D1 migration-ledger references: supplied",
    "- Fresh account-wide D1 usage check and deployment reserve: passed",
    "- Restore rehearsal and stateful staging acceptance: successful GitHub Actions runs verified against the candidate commit",
    "- Candidate source tree: matches the main release commit exactly",
    "- Service-key permission and Queue configuration review references: supplied",
    "- No Cloudflare API, D1, or Queue API calls were made by this preflight",
    "",
    `Candidate commit: ${result.candidateCommit}`,
    `Main release commit: ${result.releaseCommit}`,
    `D1 rows used: ${result.d1RowsRead} / hard stop ${result.d1HardStopRows}; reserve ${result.d1ReleaseReserveRows}`,
    "",
    "This preflight validates evidence references and GitHub workflow outcomes. It does not independently download or decrypt the external backup, inspect D1, inspect Cloudflare quotas, or prove the semantic correctness of operator-supplied evidence. The protected production Environment approval remains a separate required gate.",
  ].join("\n");
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) appendFileSync(summaryPath, summary + "\n");
  console.log("Production cutover evidence preflight passed.");
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath && import.meta.url === invokedPath) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
