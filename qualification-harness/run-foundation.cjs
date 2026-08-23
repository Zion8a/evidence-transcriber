const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { appendJsonl } = require("./evidence.cjs");

const root = path.resolve(__dirname, "..");

const start = spawnSync(
  process.execPath,
  [path.join(__dirname, "start-run.cjs")],
  { cwd: root, encoding: "utf8" }
);

process.stdout.write(start.stdout);
process.stderr.write(start.stderr);

if (start.status !== 0) {
  process.exit(start.status ?? 1);
}

const match = start.stdout.match(/^RUN:\s+(.+)$/m);

if (!match) {
  console.error("RUN FAILED: run ID not found");
  process.exit(1);
}

const runId = match[1].trim();
const runDir = path.join(root, "qualification-runs", runId);
const logsDir = path.join(runDir, "logs");

fs.mkdirSync(logsDir, { recursive: true });

appendJsonl(runDir, "actions.jsonl", {
  sequence: 1,
  timestamp: new Date().toISOString(),
  decisionType: "predefined",
  action: "launch-packaged-application",
  reason: "Foundation qualification of the packaged baseline"
});

const launch = spawnSync(
  process.execPath,
  [path.join(__dirname, "launch-packaged-app.cjs")],
  { cwd: root, encoding: "utf8" }
);

const evidence = launch.stdout + launch.stderr;

const titleMatch = evidence.match(/^TITLE:\s+(.+)$/m);

appendJsonl(runDir, "observations.jsonl", {
  sequence: 1,
  timestamp: new Date().toISOString(),
  observationType: "ui",
  observation: "window-title",
  value: titleMatch ? titleMatch[1].trim() : null
});

fs.writeFileSync(
  path.join(logsDir, "foundation.log"),
  evidence,
  "utf8"
);

process.stdout.write(evidence);

const result = launch.status === 0 ? "PASS" : "FAIL";

appendJsonl(runDir, "oracle-results.jsonl", {
  sequence: 1,
  timestamp: new Date().toISOString(),
  oracle: "packaged-app-launch",
  result,
  evidence: "logs/foundation.log"
});

console.log("FOUNDATION RESULT:", result);

process.exitCode = launch.status ?? 1;