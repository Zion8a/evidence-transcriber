const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const sessionDirArg = process.argv[2];
const expectedRelativePath = process.argv[3];
const beforeHash = process.argv[4];
const expectedSizeArg = process.argv[5];
const runDirArg = process.argv[6];

if (
  !sessionDirArg ||
  !expectedRelativePath ||
  !beforeHash ||
  !expectedSizeArg
) {
  console.error(
    "Usage: source-preservation-oracle <sessionDir> <expectedRelativePath> <beforeHash> <expectedSizeBytes> [runDir]"
  );
  process.exit(1);
}

if (
  !/^[0-9a-fA-F]{64}$/.test(beforeHash)
) {
  console.error(
    "SOURCE ORIGINAL PRESERVATION: FAIL invalid SHA-256 baseline"
  );
  process.exit(1);
}

const expectedSize =
  Number(expectedSizeArg);

if (!Number.isFinite(expectedSize)) {
  console.error(
    "SOURCE ORIGINAL PRESERVATION: FAIL invalid expected size"
  );
  process.exit(1);
}

const sessionDir =
  path.resolve(sessionDirArg);

const sessionFile =
  path.join(sessionDir, "session.json");

function hashFile(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function normalizedRelative(value) {
  return path.normalize(value);
}

if (!fs.existsSync(sessionFile)) {
  console.error(
    "SOURCE ORIGINAL PRESERVATION: FAIL session.json missing"
  );
  process.exit(1);
}

const session = JSON.parse(
  fs.readFileSync(sessionFile, "utf8")
);

const currentRelativePath =
  session?.source?.relativePath;

const currentMetadataSize =
  session?.source?.sizeBytes;

if (!currentRelativePath) {
  console.error(
    "SOURCE ORIGINAL PRESERVATION: FAIL source.relativePath missing"
  );
  process.exit(1);
}

const sourcePath =
  path.resolve(
    sessionDir,
    currentRelativePath
  );

const containmentCheck =
  path.relative(
    sessionDir,
    sourcePath
  );

if (
  containmentCheck.startsWith("..") ||
  path.isAbsolute(containmentCheck)
) {
  console.error(
    "SOURCE ORIGINAL PRESERVATION: FAIL source path escapes session directory"
  );
  process.exit(1);
}

if (!fs.existsSync(sourcePath)) {
  console.error(
    "SOURCE ORIGINAL PRESERVATION: FAIL source file missing"
  );
  process.exit(1);
}

const stat =
  fs.statSync(sourcePath);

const afterHash =
  hashFile(sourcePath);

const relativePathMatch =
  normalizedRelative(currentRelativePath) ===
  normalizedRelative(expectedRelativePath);

const hashMatch =
  afterHash.toLowerCase() ===
  beforeHash.toLowerCase();

const actualSizeMatch =
  stat.size === expectedSize;

const metadataSizeMatch =
  currentMetadataSize === expectedSize;

const result =
  relativePathMatch &&
  hashMatch &&
  actualSizeMatch &&
  metadataSizeMatch
    ? "PASS"
    : "FAIL";

console.log(
  "SOURCE ORIGINAL PRESERVATION:",
  result
);

console.log(
  "SOURCE PATH MATCH:",
  relativePathMatch
);

console.log(
  "SOURCE HASH MATCH:",
  hashMatch
);

console.log(
  "SOURCE SIZE MATCH:",
  actualSizeMatch
);

console.log(
  "SOURCE METADATA SIZE MATCH:",
  metadataSizeMatch
);

if (runDirArg) {
  const {
    appendJsonl
  } = require("./evidence.cjs");

  appendJsonl(
    path.resolve(runDirArg),
    "oracle-results.jsonl",
    {
      timestamp:
        new Date().toISOString(),
      oracle:
        "source-original-preservation",
      result,
      expectedRelativePath,
      currentRelativePath,
      beforeHash:
        beforeHash.toLowerCase(),
      afterHash:
        afterHash.toLowerCase(),
      expectedSizeBytes:
        expectedSize,
      actualSizeBytes:
        stat.size,
      metadataSizeBytes:
        currentMetadataSize,
      target: sourcePath
    }
  );
}

process.exitCode =
  result === "PASS" ? 0 : 1;