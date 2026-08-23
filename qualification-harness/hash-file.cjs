const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const file = process.argv[2];

if (!file) {
  console.error("Usage: node hash-file.cjs <file>");
  process.exit(1);
}

const resolved = path.resolve(file);

if (!fs.existsSync(resolved)) {
  console.error("FILE NOT FOUND:", resolved);
  process.exit(1);
}

const hash = crypto
  .createHash("sha256")
  .update(fs.readFileSync(resolved))
  .digest("hex");

console.log(hash);