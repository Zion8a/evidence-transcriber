import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  reopenSession,
  saveEditedTranscript,
} from "./persistence.js";

const sessionId = process.argv[2];

if (!sessionId) {
  console.error(
    "Usage: npm run edit -- <session-id>",
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

const existingEdited =
  reopened.editedTranscript;

const editedText =
  existingEdited?.text ??
  reopened.rawTranscript.segments
    .map((segment) => segment.text.trim())
    .join("\n\n");

if (!existingEdited) {
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
}

const workingPath = join(
  sessionDirectory,
  "edited-working.txt",
);

await writeFile(
  workingPath,
  editedText,
  {
    encoding: "utf8",
    flag: "w",
  },
);

console.log("");
console.log("Editable transcript prepared.");
console.log(`Session ID: ${sessionId}`);
console.log(`Working file: ${workingPath}`);
console.log("");
console.log(
  "Edit this file, then use the save command in the next step.",
);
