const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { appendJsonl } = require("./evidence.cjs");

const root = path.resolve(__dirname, "..");

const rawFileArg = process.argv[2];
const cardText = process.argv[3];
const marker = process.argv[4];
const maxSteps = Number(process.argv[5] || 8);

if (!rawFileArg || !cardText || !marker) {
  console.error(
    "Usage: run-autonomous-agent <rawFile> <cardText> <marker> [maxSteps]"
  );
  process.exit(1);
}

if (
  !Number.isInteger(maxSteps) ||
  maxSteps < 1 ||
  maxSteps > 20
) {
  console.error("maxSteps must be an integer from 1 to 20.");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY NOT SET");
  process.exit(1);
}

const rawFile = path.resolve(rawFileArg);

if (!fs.existsSync(rawFile)) {
  console.error(`Raw transcript not found: ${rawFile}`);
  process.exit(1);
}

const sessionDir = path.dirname(rawFile);

function readJson(file) {
  return JSON.parse(
    fs.readFileSync(file, "utf8")
  );
}

function writeJson(file, value) {
  fs.writeFileSync(
    file,
    JSON.stringify(value, null, 2),
    "utf8"
  );
}

function readJsonl(file) {
  if (!fs.existsSync(file)) {
    return [];
  }

  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function runNode(script, args, logFile) {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, script), ...args],
    {
      cwd: root,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 10 * 1024 * 1024
    }
  );

  const output =
    (result.stdout || "") +
    (result.stderr || "");

  if (logFile) {
    fs.writeFileSync(
      logFile,
      output,
      "utf8"
    );
  }

  process.stdout.write(output);

  return {
    status:
      typeof result.status === "number"
        ? result.status
        : 1,
    output
  };
}

function startRun() {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, "start-run.cjs")],
    {
      cwd: root,
      encoding: "utf8",
      env: process.env
    }
  );

  const output =
    (result.stdout || "") +
    (result.stderr || "");

  process.stdout.write(output);

  if (result.status !== 0) {
    throw new Error("start-run failed");
  }

  const runMatch =
    output.match(/RUN:\s*(.+)/);

  const evidenceMatch =
    output.match(/EVIDENCE:\s*(.+)/);

  if (!runMatch || !evidenceMatch) {
    throw new Error(
      "Could not parse run identity."
    );
  }

  return {
    runId: runMatch[1].trim(),
    runDir: path.resolve(
      evidenceMatch[1].trim()
    )
  };
}

function extractHash(output) {
  const matches =
    output.match(/\b[0-9a-fA-F]{64}\b/g);

  if (!matches || matches.length === 0) {
    return null;
  }

  return matches[
    matches.length - 1
  ].toLowerCase();
}

function extractSourceInfo(output) {
  const line = output
    .split(/\r?\n/)
    .find((entry) =>
      entry.startsWith(
        "SOURCE ORIGINAL JSON:"
      )
    );

  if (!line) {
    return null;
  }

  try {
    return JSON.parse(
      line
        .slice(
          "SOURCE ORIGINAL JSON:".length
        )
        .trim()
    );
  } catch {
    return null;
  }
}

function latestOracleMap(oracles) {
  const map = new Map();

  for (const oracle of oracles) {
    map.set(oracle.oracle, oracle);
  }

  return map;
}

function finalize({
  runId,
  runDir,
  runStatus,
  endReason,
  stopDecision,
  actionHistory
}) {
  const decisions = readJsonl(
    path.join(
      runDir,
      "agent-decisions.jsonl"
    )
  );

  const oracles = readJsonl(
    path.join(
      runDir,
      "oracle-results.jsonl"
    )
  );

  const oracleMap =
    latestOracleMap(oracles);

  const claims = [
    {
      claim: "raw transcript immutability",
      oracle:
        "raw-transcript-immutability"
    },
    {
      claim:
        "edited transcript separation",
      oracle:
        "edited-transcript-separation"
    },
    {
      claim:
        "restart/reopen persistence",
      oracle: "reopen-persistence"
    },
    {
      claim:
        "source/original preservation",
      oracle:
        "source-original-preservation"
    }
  ];

  const claimResults =
    claims.map((item) => {
      if (!item.oracle) {
        return {
          claim: item.claim,
          result: "NOT VERIFIED",
          evidence: null
        };
      }

      const evidence =
        oracleMap.get(item.oracle);

      return {
        claim: item.claim,
        result:
          evidence?.result ||
          "NOT VERIFIED",
        evidence:
          evidence || null
      };
    });

  const hasFail =
    claimResults.some(
      (claim) =>
        claim.result === "FAIL"
    );

  const allPass =
    claimResults.every(
      (claim) =>
        claim.result === "PASS"
    );

  const missionResult =
    hasFail
      ? "FAIL"
      : allPass
        ? "PASS"
        : "NOT VERIFIED";

  const decisionCounts = {
    agentSelected:
      decisions.filter(
        (d) =>
          d.decisionType ===
          "agent-selected"
      ).length,
    adaptive:
      decisions.filter(
        (d) =>
          d.decisionType ===
          "adaptive"
      ).length
  };

  const summary = {
    runId,
    runStatus,
    missionResult,
    endReason,
    maxSteps,
    humanInterventionsDuringRun: 0,
    decisionCounts,
    totalDecisions: decisions.length,
    executedActions:
      actionHistory.length,
    stopDecision:
      stopDecision || null,
    claims: claimResults
  };

  writeJson(
    path.join(
      runDir,
      "autonomous-summary.json"
    ),
    summary
  );

  const report = [
    "# Autonomous Qualification Report",
    "",
    `Run: ${runId}`,
    `Run status: ${runStatus}`,
    `Mission result: ${missionResult}`,
    `End reason: ${endReason}`,
    `Human interventions during autonomous loop: 0`,
    "",
    "## Agent decisions",
    "",
    `Agent-selected: ${decisionCounts.agentSelected}`,
    `Adaptive: ${decisionCounts.adaptive}`,
    `Total decisions: ${decisions.length}`,
    "",
    "## Deterministic qualification evidence",
    "",
    ...claimResults.map(
      (claim) =>
        `- ${claim.claim}: ${claim.result}`
    ),
    "",
    "## Agent stop",
    "",
    stopDecision
      ? `Action: ${stopDecision.nextAction}`
      : "No agent stop decision was reached.",
    stopDecision
      ? `Reason: ${stopDecision.reason}`
      : "",
    "",
    "## Interpretation",
    "",
    missionResult === "PASS"
      ? "All mission claims have deterministic PASS evidence."
      : missionResult === "FAIL"
        ? "At least one mission claim has deterministic FAIL evidence."
        : "At least one mission claim remains NOT VERIFIED. No unsupported PASS is reported.",
    ""
  ].join("\n");

  fs.writeFileSync(
    path.join(
      runDir,
      "qualification-report.md"
    ),
    report,
    "utf8"
  );

  console.log(
    "\n=== AUTONOMOUS RUN COMPLETE ==="
  );
  console.log(
    "RUN STATUS:",
    runStatus
  );
  console.log(
    "MISSION RESULT:",
    missionResult
  );
  console.log(
    "HUMAN INTERVENTIONS DURING RUN: 0"
  );
  console.log(
    "AGENT-SELECTED DECISIONS:",
    decisionCounts.agentSelected
  );
  console.log(
    "ADAPTIVE DECISIONS:",
    decisionCounts.adaptive
  );

  for (const claim of claimResults) {
    console.log(
      `${claim.claim}: ${claim.result}`
    );
  }

  console.log(
    "REPORT:",
    path.join(
      runDir,
      "qualification-report.md"
    )
  );
}

async function main() {
  console.log(
    "=== AUTONOMOUS AGENT LOOP 0.1 ==="
  );
  console.log(
    "MAX STEPS:",
    maxSteps
  );

  const {
    runId,
    runDir
  } = startRun();

  fs.mkdirSync(
    path.join(runDir, "logs"),
    {
      recursive: true
    }
  );

  let availableContext = {
    rawFile,
    sessionDir,
    cardText,
    marker
  };

  let actionHistory = [];
  let successfulEditOccurred = false;

  let runStatus = "STEP_LIMIT";
  let endReason =
    "maximum autonomous step count reached";
  let stopDecision = null;

  for (
    let step = 0;
    step < maxSteps;
    step += 1
  ) {
    console.log(
      `\n=== AUTONOMOUS STEP ${step} ===`
    );

    const observations =
      readJsonl(
        path.join(
          runDir,
          "observations.jsonl"
        )
      );

    const oracleResults =
      readJsonl(
        path.join(
          runDir,
          "oracle-results.jsonl"
        )
      );

    const state = {
      step,
      observations,
      oracleResults,
      actionResults:
        actionHistory,
      resolvedRisks: [],
      availableContext,
      safety: {
        maxSteps,
        productSourceModificationAllowed:
          false,
        deterministicEvidenceRequiredForPass:
          true
      }
    };

    const stateFile =
      path.join(
        runDir,
        `state-step-${step}.json`
      );

    const decisionFile =
      path.join(
        runDir,
        `decision-step-${step}.json`
      );

    writeJson(
      stateFile,
      state
    );

    console.log(
      "\n--- AI DECISION ---"
    );

    const provider =
      runNode(
        "ai-decision-provider.cjs",
        [
          stateFile,
          decisionFile
        ],
        path.join(
          runDir,
          "logs",
          `provider-step-${step}.log`
        )
      );

    if (provider.status !== 0) {
      runStatus =
        "PROVIDER_FAILURE";
      endReason =
        `AI provider failed at step ${step}`;

      break;
    }

    const genericMetadata =
      path.join(
        runDir,
        "provider-metadata.json"
      );

    if (
      fs.existsSync(
        genericMetadata
      )
    ) {
      fs.copyFileSync(
        genericMetadata,
        path.join(
          runDir,
          `provider-metadata-step-${step}.json`
        )
      );
    }

    console.log(
      "\n--- DECISION GATEWAY ---"
    );

    const validation =
      runNode(
        "validate-agent-decision.cjs",
        [decisionFile],
        path.join(
          runDir,
          "logs",
          `gateway-step-${step}.log`
        )
      );

    if (validation.status !== 0) {
      runStatus =
        "GATEWAY_BLOCKED";
      endReason =
        `Decision Gateway blocked step ${step}`;

      break;
    }

    const decision =
      readJson(decisionFile);

    appendJsonl(
      runDir,
      "agent-decisions.jsonl",
      {
        timestamp:
          new Date().toISOString(),
        step,
        ...decision
      }
    );

    if (
      decision.nextAction ===
      "stop"
    ) {
      stopDecision = decision;
      runStatus = "COMPLETED";
      endReason =
        "agent selected stop";

      console.log(
        "\nAGENT SELECTED STOP"
      );
      console.log(
        "REASON:",
        decision.reason
      );

      break;
    }

    const contextFile =
      path.join(
        runDir,
        `context-step-${step}.json`
      );

    writeJson(
      contextFile,
      {
        ...availableContext,
        runDir
      }
    );

    console.log(
      "\n--- EXECUTE AI ACTION ---"
    );

    const execution =
      runNode(
        "execute-agent-decision.cjs",
        [
          decisionFile,
          contextFile
        ],
        path.join(
          runDir,
          "logs",
          `execution-step-${step}.log`
        )
      );

    let actionResult =
      execution.status === 0
        ? "PASS"
        : "FAIL";

    let resultNote = null;

    if (
      decision.nextAction ===
      "hash_source_original" &&
      actionResult === "PASS"
    ) {
      const sourceInfo =
        extractSourceInfo(
          execution.output
        );

      if (!sourceInfo) {
        actionResult = "FAIL";
        resultNote =
          "Source/original information could not be extracted from tool output.";
      } else if (
        !successfulEditOccurred &&
        !availableContext.sourceBeforeHash
      ) {
        availableContext = {
          ...availableContext,
          sourceRelativePath:
            sourceInfo.relativePath,
          sourceBeforeHash:
            sourceInfo.sha256.toLowerCase(),
          sourceSizeBytes:
            sourceInfo.actualSizeBytes
        };

        appendJsonl(
          runDir,
          "observations.jsonl",
          {
            timestamp:
              new Date().toISOString(),
            observationType:
              "product-state",
            observation:
              "source-original-baseline",
            relativePath:
              sourceInfo.relativePath,
            sha256:
              sourceInfo.sha256.toLowerCase(),
            sizeBytes:
              sourceInfo.actualSizeBytes,
            target:
              sourceInfo.sourcePath
          }
        );

        resultNote =
          "Source/original info accepted as pre-edit baseline.";
      } else {
        availableContext = {
          ...availableContext,
          currentSourceRelativePath:
            sourceInfo.relativePath,
          currentSourceHash:
            sourceInfo.sha256.toLowerCase(),
          currentSourceSizeBytes:
            sourceInfo.actualSizeBytes
        };

        appendJsonl(
          runDir,
          "observations.jsonl",
          {
            timestamp:
              new Date().toISOString(),
            observationType:
              "product-state",
            observation:
              "source-original-current",
            relativePath:
              sourceInfo.relativePath,
            sha256:
              sourceInfo.sha256.toLowerCase(),
            sizeBytes:
              sourceInfo.actualSizeBytes,
            target:
              sourceInfo.sourcePath
          }
        );

        resultNote =
          "Source/original info was not promoted to a baseline because editing already occurred or a valid baseline already exists.";
      }
    }

    if (
      decision.nextAction ===
      "hash_raw_transcript" &&
      actionResult === "PASS"
    ) {
      const hash =
        extractHash(
          execution.output
        );

      if (!hash) {
        actionResult = "FAIL";
        resultNote =
          "SHA-256 could not be extracted from tool output.";
      } else if (
        !successfulEditOccurred &&
        !availableContext.beforeHash
      ) {
        availableContext = {
          ...availableContext,
          beforeHash: hash
        };

        appendJsonl(
          runDir,
          "observations.jsonl",
          {
            timestamp:
              new Date().toISOString(),
            observationType:
              "product-state",
            observation:
              "raw-hash-before",
            value: hash,
            target: rawFile
          }
        );

        resultNote =
          "Hash accepted as pre-edit baseline.";
      } else {
        availableContext = {
          ...availableContext,
          currentRawHash: hash
        };

        appendJsonl(
          runDir,
          "observations.jsonl",
          {
            timestamp:
              new Date().toISOString(),
            observationType:
              "product-state",
            observation:
              "raw-hash-current",
            value: hash,
            target: rawFile
          }
        );

        resultNote =
          "Hash was not promoted to beforeHash because a valid pre-edit baseline already exists or editing has already occurred.";
      }
    }

    if (
      decision.nextAction ===
      "edit_and_save" &&
      actionResult === "PASS"
    ) {
      const markerVerified =
        execution.output.includes(
          "MARKER IN UI: true"
        );

      if (!markerVerified) {
        actionResult = "FAIL";
        resultNote =
          "UI marker confirmation was missing.";
      } else {
        successfulEditOccurred =
          true;

        availableContext = {
          ...availableContext,
          editCompleted: true
        };

        appendJsonl(
          runDir,
          "observations.jsonl",
          {
            timestamp:
              new Date().toISOString(),
            observationType: "ui",
            observation:
              "edited-transcript-saved",
            marker,
            markerFoundInUi: true,
            target: cardText
          }
        );

        resultNote =
          "Edited marker verified in UI.";
      }
    }

    const actionRecord = {
      timestamp:
        new Date().toISOString(),
      step,
      action:
        decision.nextAction,
      decisionType:
        decision.decisionType,
      result: actionResult,
      note: resultNote,
      evidence:
        `logs/execution-step-${step}.log`
    };

    actionHistory.push(
      actionRecord
    );

    appendJsonl(
      runDir,
      "agent-action-results.jsonl",
      actionRecord
    );

    console.log(
      "AUTONOMOUS ACTION RESULT:",
      actionResult
    );

    if (resultNote) {
      console.log(
        "NOTE:",
        resultNote
      );
    }
  }

  finalize({
    runId,
    runDir,
    runStatus,
    endReason,
    stopDecision,
    actionHistory
  });
}

main().catch((error) => {
  console.error(
    "AUTONOMOUS LOOP: FAIL",
    error.stack || error.message
  );
  process.exit(1);
});