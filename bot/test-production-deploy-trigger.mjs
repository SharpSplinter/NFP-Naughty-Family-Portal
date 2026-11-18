import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/production-bot-deploy.yml", "utf8");
const triggerStart = workflow.indexOf("on:\n");
const permissionsStart = workflow.indexOf("\npermissions:", triggerStart);
assert.notEqual(triggerStart, -1, "Production bot workflow must declare triggers.");
assert.notEqual(permissionsStart, -1, "Production bot workflow must declare permissions.");
const triggerBlock = workflow.slice(triggerStart, permissionsStart);

assert.match(triggerBlock, /workflow_dispatch:/, "Production bot deployment must remain manually dispatchable.");
assert.doesNotMatch(triggerBlock, /^\s+push:/m, "Production bot must not deploy automatically on main pushes.");
assert.doesNotMatch(triggerBlock, /^\s+pull_request:/m, "Production bot must not deploy from pull request events.");
assert.match(
  workflow,
  /if:\s*github\.event_name\s*==\s*'workflow_dispatch'\s*&&\s*github\.ref\s*==\s*'refs\/heads\/main'/,
  "The deploy job must require both a manual dispatch and the main branch.",
);

console.log("PASS production Discord bot deployment is manual-only and restricted to main.");
