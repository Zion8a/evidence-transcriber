import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  removeIncompleteSession,
  removeSessionWorkDirectory,
} from "./storage-safety.js";

async function exists(
  path: string,
): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const testRoot =
  await mkdtemp(
    join(
      tmpdir(),
      "evidence-transcriber-storage-safety-",
    ),
  );

try {
  // ==========================================================
  // 1. Incomplete session may be removed
  // ==========================================================

  const incompleteSession =
    join(
      testRoot,
      "incomplete-session",
    );

  const incompleteSourceDirectory =
    join(
      incompleteSession,
      "source",
    );

  await mkdir(
    incompleteSourceDirectory,
    {
      recursive: true,
    },
  );

  await writeFile(
    join(
      incompleteSourceDirectory,
      "recording.wav",
    ),
    Buffer.from(
      "incomplete-source",
    ),
  );

  const incompleteRemoved =
    await removeIncompleteSession(
      incompleteSession,
    );

  assert.equal(
    incompleteRemoved,
    true,
    "Session without raw transcript should be removed",
  );

  assert.equal(
    await exists(
      incompleteSession,
    ),
    false,
    "Incomplete session directory should no longer exist",
  );

  // ==========================================================
  // 2. Session with raw transcript must be protected
  // ==========================================================

  const completeSession =
    join(
      testRoot,
      "complete-session",
    );

  const completeSourceDirectory =
    join(
      completeSession,
      "source",
    );

  await mkdir(
    completeSourceDirectory,
    {
      recursive: true,
    },
  );

  const completeSourcePath =
    join(
      completeSourceDirectory,
      "recording.wav",
    );

  const rawTranscriptPath =
    join(
      completeSession,
      "raw-transcript.json",
    );

  await writeFile(
    completeSourcePath,
    Buffer.from(
      "preserved-source",
    ),
  );

  await writeFile(
    rawTranscriptPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        text: "raw transcript",
      },
      null,
      2,
    ),
    "utf8",
  );

  const completeRemoved =
    await removeIncompleteSession(
      completeSession,
    );

  assert.equal(
    completeRemoved,
    false,
    "Session with raw transcript must not be removed",
  );

  assert.equal(
    await exists(
      completeSourcePath,
    ),
    true,
    "Protected session source must remain",
  );

  assert.equal(
    await exists(
      rawTranscriptPath,
    ),
    true,
    "Protected raw transcript must remain",
  );

  // ==========================================================
  // 3. Work cleanup must not affect provenance
  // ==========================================================

  const workDirectory =
    join(
      completeSession,
      "work",
    );

  await mkdir(
    workDirectory,
    {
      recursive: true,
    },
  );

  await writeFile(
    join(
      workDirectory,
      "preprocessed.wav",
    ),
    Buffer.from(
      "derived-audio",
    ),
  );

  await writeFile(
    join(
      workDirectory,
      "whisper-output.json",
    ),
    "{}",
    "utf8",
  );

  const sourceBefore =
    await readFile(
      completeSourcePath,
    );

  const rawBefore =
    await readFile(
      rawTranscriptPath,
    );

  await removeSessionWorkDirectory(
    completeSession,
  );

  assert.equal(
    await exists(
      workDirectory,
    ),
    false,
    "Work directory should be removed",
  );

  assert.deepEqual(
    await readFile(
      completeSourcePath,
    ),
    sourceBefore,
    "Work cleanup must not modify preserved source",
  );

  assert.deepEqual(
    await readFile(
      rawTranscriptPath,
    ),
    rawBefore,
    "Work cleanup must not modify raw transcript",
  );

  console.log(
    "PASS: storage safety regression test",
  );
} finally {
  await rm(
    testRoot,
    {
      recursive: true,
      force: true,
    },
  );
}
