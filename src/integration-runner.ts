import { basename } from "node:path";
import {
  isSupportedInputFile,
  supportedInputLabel,
} from "./supported-formats.js";
import {
  transcribeImportedM4a,
} from "./transcription.js";

const sourcePath = process.argv[2];
const language = process.argv[3] ?? "sv";

if (!sourcePath) {
  console.error(
    'Usage: npm run transcribe -- "C:\\path\\to\\file"',
  );
  process.exit(1);
}

if (!isSupportedInputFile(sourcePath)) {
  console.error(
    `Student Alpha supports ${supportedInputLabel()}: ${basename(sourcePath)}`,
  );
  process.exit(1);
}

console.log(`Importing: ${sourcePath}`);
console.log(
  "Preprocessing audio and transcribing locally...",
);

const result = await transcribeImportedM4a(
  sourcePath,
  language,
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

