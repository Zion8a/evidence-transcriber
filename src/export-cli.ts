import { resolve, join } from "node:path";
import {
  exportTranscriptToTxt,
} from "./persistence.js";

const sessionId = process.argv[2];
const requestedOutputPath = process.argv[3];

if (!sessionId) {
  console.error(
    "Usage: npm run export -- <session-id> [output-path]",
  );
  process.exit(1);
}

const sessionDirectory = join(
  ".\\local-sessions",
  sessionId,
);

const outputPath = resolve(
  requestedOutputPath ??
    `transcript-${sessionId}.txt`,
);

await exportTranscriptToTxt(
  sessionDirectory,
  outputPath,
);

console.log("");
console.log("Transcript exported.");
console.log(`Session ID: ${sessionId}`);
console.log(`Output: ${outputPath}`);
