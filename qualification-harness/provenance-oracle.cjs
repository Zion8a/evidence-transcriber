const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const raw = process.argv[2];
const before = process.argv[3];
const marker = process.argv[4];

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

console.log("RAW IMMUTABILITY:", rawImmutable ? "PASS" : "FAIL");
console.log("EDIT SEPARATION:", editSeparated ? "PASS" : "FAIL");

process.exitCode = rawImmutable && editSeparated ? 0 : 1;