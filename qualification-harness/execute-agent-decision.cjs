const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const decisionFile = process.argv[2];
const contextFile = process.argv[3];

if (!decisionFile || !contextFile) {
  console.error(
    "Usage: execute-agent-decision <decision.json> <context.json>"
  );
  process.exit(1);
}

function run(script, args = []) {
  return spawnSync(
    process.execPath,
    [path.join(__dirname, script), ...args],
    {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8"
    }
  );
}

function requireContext(context, fields) {
  for (const field of fields) {
    if (!context[field]) {
      throw new Error(`Missing execution context: ${field}`);
    }
  }
}

const validation = run(
  "validate-agent-decision.cjs",
  [decisionFile]
);

process.stdout.write(validation.stdout || "");
process.stderr.write(validation.stderr || "");

if (validation.status !== 0) {
  console.error("EXECUTION BLOCKED: invalid agent decision");
  process.exit(1);
}

const decision = JSON.parse(
  fs.readFileSync(path.resolve(decisionFile), "utf8")
);

const context = JSON.parse(
  fs.readFileSync(path.resolve(contextFile), "utf8")
);

console.log("EXECUTOR ACTION:", decision.nextAction);

let result;

switch (decision.nextAction) {
  case "hash_raw_transcript":
    requireContext(context, ["rawFile"]);

    result = run(
      "hash-file.cjs",
      [context.rawFile]
    );
    break;

  case "verify_provenance":
    requireContext(
      context,
      ["rawFile", "beforeHash", "marker"]
    );

    result = run(
      "provenance-oracle.cjs",
      [
        context.rawFile,
        context.beforeHash,
        context.marker,
        ...(context.runDir ? [context.runDir] : [])
      ]
    );
    break;

  case "reopen_transcript":
    requireContext(
      context,
      ["cardText", "marker"]
    );

    result = run(
      "reopen-session.cjs",
      [
        context.cardText,
        context.marker,
        ...(context.runDir ? [context.runDir] : [])
      ]
    );
    break;

  case "edit_and_save":
    requireContext(
      context,
      ["cardText", "marker"]
    );

    result = run(
      "edit-save-session.cjs",
      [context.cardText, context.marker]
    );
    break;

  case "run_provenance_regression":
    requireContext(
      context,
      ["rawFile", "cardText", "marker"]
    );

    result = run(
      "run-provenance-regression.cjs",
      [
        context.rawFile,
        context.cardText,
        context.marker
      ]
    );
    break;

  case "stop":
    console.log("EXECUTOR: agent requested stop");
    process.exit(0);

  default:
    console.error(
      `EXECUTION BLOCKED: tool has no executor: ${decision.nextAction}`
    );
    process.exit(1);
}

process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");

const executionResult =
  result.status === 0 ? "PASS" : "FAIL";

console.log("EXECUTION RESULT:", executionResult);

process.exitCode =
  executionResult === "PASS" ? 0 : 1;