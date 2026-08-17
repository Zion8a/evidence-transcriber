import { basename } from "node:path";
import {
  transcribeImportedM4a,
} from "./transcription.js";

const sourcePath = process.argv[2];

if (!sourcePath) {
  console.error(
    'Usage: npm run transcribe -- "C:\\path\\to\\file.m4a"',
  );
  process.exit(1);
}

if (!sourcePath.toLowerCase().endsWith(".m4a")) {
  console.error(
    `Student Alpha currently supports M4A only: ${basename(sourcePath)}`,
  );
  process.exit(1);
}

console.log(`Importing: ${sourcePath}`);
console.log("Preprocessing audio and transcribing locally...");

const result = await transcribeImportedM4a(
  sourcePath,
);

console.log("");
console.log("Transcription complete.");
console.log(
  `Session ID: ${result.reopened.metadata.sessionId}`,
);
console.log(
  `Source: ${result.reopened.metadata.source.originalName}`,
);
console.log(
  `Segments: ${result.reopened.rawTranscript.segments.length}`,
);
console.log(
  `Session directory: ${result.sessionDirectory}`,
);
