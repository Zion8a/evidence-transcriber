import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  reopenSession,
  saveEditedTranscript,
} from "./persistence.js";

const sessionId = process.argv[2];

if (!sessionId) {
  console.error(
    "Usage: npm run save -- <session-id>",
  );
  process.exit(1);
}

const sessionDirectory = join(
  ".\\local-sessions",
  sessionId,
);

const reopened = await reopenSession(
  sessionDirectory,
);

const workingPath = join(
  sessionDirectory,
  "edited-working.txt",
);

const editedText = await readFile(
  workingPath,
  "utf8",
);

await saveEditedTranscript(
  sessionDirectory,
  {
    schemaVersion: 1,
    sessionId: reopened.metadata.sessionId,
    source: {
      relativePath:
        reopened.metadata.source.relativePath,
    },
    basedOnRawTranscript: {
      relativePath: "raw-transcript.json",
    },
    updatedAt: new Date().toISOString(),
    text: editedText,
  },
);

const verified = await reopenSession(
  sessionDirectory,
);

console.log("");
console.log("Edited transcript saved.");
console.log(`Session ID: ${sessionId}`);
console.log(
  `Characters: ${verified.editedTranscript?.text.length ?? 0}`,
);
console.log(
  `Edited transcript: ${join(
    sessionDirectory,
    "edited-transcript.json",
  )}`,
);
