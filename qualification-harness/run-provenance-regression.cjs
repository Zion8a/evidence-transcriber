const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { appendJsonl } = require("./evidence.cjs");

const rawFile = process.argv[2];
const cardText = process.argv[3];
const marker = process.argv[4];

if (!rawFile || !cardText || !marker) {
  console.error(
    "Usage: run-provenance-regression <rawFile> <cardText> <marker>"
  );
  process.exit(1);
}

const root = path.resolve(__dirname, "..");

function runScript(script, args = []) {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, script), ...args],
    {
      cwd: root,
      encoding: "utf8"
    }
  );

  const output =
    (result.stdout || "") +
    (result.stderr || "");

  process.stdout.write(output);

  return {
    status: result.status ?? 1,
    output
  };
}

const start = runScript("start-run.cjs");

if (start.status !== 0) {
  process.exit(1);
}

const runMatch = start.output.match(/^RUN:\s+(.+)$/m);

if (!runMatch) {
  console.error("RUN FAILED: run ID not found");
  process.exit(1);
}

const runId = runMatch[1].trim();
const runDir = path.join(root, "qualification-runs", runId);
const logsDir = path.join(runDir, "logs");

fs.mkdirSync(logsDir, { recursive: true });

appendJsonl(runDir, "actions.jsonl", {
  timestamp: new Date().toISOString(),
  decisionType: "predefined",
  action: "capture-raw-hash-before",
  target: rawFile
});

const hash = runScript("hash-file.cjs", [rawFile]);

if (hash.status !== 0) {
  console.error("REGRESSION RESULT: FAIL");
  process.exit(1);
}

const beforeHash = hash.output.trim();

appendJsonl(runDir, "observations.jsonl", {
  timestamp: new Date().toISOString(),
  observationType: "product-state",
  observation: "raw-hash-before",
  value: beforeHash,
  target: rawFile
});

appendJsonl(runDir, "actions.jsonl", {
  timestamp: new Date().toISOString(),
  decisionType: "predefined",
  action: "edit-and-save-transcript",
  target: cardText,
  marker
});

const edit = runScript(
  "edit-save-session.cjs",
  [cardText, marker]
);

fs.writeFileSync(
  path.join(logsDir, "edit-save.log"),
  edit.output,
  "utf8"
);

const markerInUi =
  /MARKER IN UI:\s*true/i.test(edit.output);

appendJsonl(runDir, "oracle-results.jsonl", {
  timestamp: new Date().toISOString(),
  oracle: "edit-save-ui",
  result:
    edit.status === 0 && markerInUi
      ? "PASS"
      : "FAIL",
  marker,
  target: cardText
});

if (edit.status !== 0 || !markerInUi) {
  console.error("REGRESSION RESULT: FAIL");
  process.exit(1);
}

const provenance = runScript(
  "provenance-oracle.cjs",
  [rawFile, beforeHash, marker, runDir]
);

fs.writeFileSync(
  path.join(logsDir, "provenance.log"),
  provenance.output,
  "utf8"
);

const reopen = runScript(
  "reopen-session.cjs",
  [cardText, marker, runDir]
);

fs.writeFileSync(
  path.join(logsDir, "reopen.log"),
  reopen.output,
  "utf8"
);

const overall =
  provenance.status === 0 &&
  reopen.status === 0
    ? "PASS"
    : "FAIL";

appendJsonl(runDir, "oracle-results.jsonl", {
  timestamp: new Date().toISOString(),
  oracle: "provenance-regression",
  result: overall,
  target: cardText,
  marker
});

console.log("REGRESSION RESULT:", overall);

process.exitCode =
  overall === "PASS" ? 0 : 1;