const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const sessionDirArg = process.argv[2];

if (!sessionDirArg) {
  console.error(
    "Usage: source-original-info <sessionDir>"
  );
  process.exit(1);
}

const sessionDir = path.resolve(sessionDirArg);
const sessionFile = path.join(
  sessionDir,
  "session.json"
);

function fail(message) {
  console.error(
    "SOURCE ORIGINAL INFO: FAIL",
    message
  );
  process.exit(1);
}

function sha256(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

if (!fs.existsSync(sessionFile)) {
  fail(`session.json not found: ${sessionFile}`);
}

const session = JSON.parse(
  fs.readFileSync(sessionFile, "utf8")
);

const relativePath =
  session?.source?.relativePath;

const metadataSizeBytes =
  session?.source?.sizeBytes;

if (
  !relativePath ||
  typeof relativePath !== "string"
) {
  fail(
    "session.json does not contain source.relativePath"
  );
}

if (
  !Number.isFinite(metadataSizeBytes)
) {
  fail(
    "session.json does not contain a numeric source.sizeBytes"
  );
}

const sourcePath = path.resolve(
  sessionDir,
  relativePath
);

const containmentCheck = path.relative(
  sessionDir,
  sourcePath
);

if (
  containmentCheck.startsWith("..") ||
  path.isAbsolute(containmentCheck)
) {
  fail(
    "source.relativePath resolves outside the session directory"
  );
}

if (!fs.existsSync(sourcePath)) {
  fail(
    `Source/original file not found: ${sourcePath}`
  );
}

const stat = fs.statSync(sourcePath);

if (!stat.isFile()) {
  fail(
    `Source/original target is not a file: ${sourcePath}`
  );
}

if (stat.size !== metadataSizeBytes) {
  fail(
    `Source/original size does not match session metadata: actual=${stat.size} metadata=${metadataSizeBytes}`
  );
}

const result = {
  relativePath,
  sourcePath,
  metadataSizeBytes,
  actualSizeBytes: stat.size,
  metadataSizeMatches:
    stat.size === metadataSizeBytes,
  sha256: sha256(sourcePath)
};

console.log(
  "SOURCE ORIGINAL INFO: PASS"
);

console.log(
  "SOURCE ORIGINAL JSON:",
  JSON.stringify(result)
);