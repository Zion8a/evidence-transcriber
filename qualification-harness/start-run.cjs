const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();

const now = new Date();
const runId = now.toISOString().replace(/[:.]/g, "-");

const runDir = path.resolve("qualification-runs", runId);
fs.mkdirSync(runDir, { recursive: true });

const run = {
  runId,
  timestamp: now.toISOString(),
  targetTag: "packaged-baseline-0.1",
  targetCommit: "f176e78",
  harnessCommit: git("rev-parse", "HEAD"),
  harnessDirty: git("status", "--porcelain").length > 0,
  platform: process.platform,
  osRelease: require("os").release()
};

fs.writeFileSync(
  path.join(runDir, "run.json"),
  JSON.stringify(run, null, 2) + "\n",
  "utf8"
);

console.log("RUN:", runId);
console.log("EVIDENCE:", runDir);