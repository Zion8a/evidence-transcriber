const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { appendJsonl } = require("./evidence.cjs");

const raw = process.argv[2];
const before = process.argv[3];
const marker = process.argv[4];
const runDir = process.argv[5];

if (!raw || !before || !marker) {
  console.error("Usage: provenance-oracle <raw> <beforeHash> <marker>");
  process.exit(1);
}

const after = crypto
  .createHash("sha256")
  .update(fs.readFileSync(raw))
  .digest("hex");

const edited = path.join(path.dirname(raw), "edited-transcript.json");
const editedJson = JSON.parse(fs.readFileSync(edited, "utf8"));

const rawImmutable = before === after;
const editSeparated = editedJson.text.includes(marker);

if (runDir) {
  appendJsonl(runDir, "oracle-results.jsonl", {
    timestamp: new Date().toISOString(),
    oracle: "raw-transcript-immutability",
    result: rawImmutable ? "PASS" : "FAIL",
    beforeHash: before,
    afterHash: after,
    target: raw
  });

  appendJsonl(runDir, "oracle-results.jsonl", {
    timestamp: new Date().toISOString(),
    oracle: "edited-transcript-separation",
    result: editSeparated ? "PASS" : "FAIL",
    marker,
    target: edited
  });
}

console.log("RAW IMMUTABILITY:", rawImmutable ? "PASS" : "FAIL");
console.log("EDIT SEPARATION:", editSeparated ? "PASS" : "FAIL");

process.exitCode = rawImmutable && editSeparated ? 0 : 1;