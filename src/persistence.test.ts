import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createSession,
  exportTranscriptToTxt,
  persistRawTranscript,
  reopenSession,
  saveEditedTranscript,
  type RawTranscript,
} from "./persistence.js";

function sha256(data: Buffer): string {
  return createHash("sha256")
    .update(data)
    .digest("hex");
}

const testRoot = await mkdtemp(
  join(
    tmpdir(),
    "evidence-transcriber-persistence-",
  ),
);

try {
  const sourcePath = join(
    testRoot,
    "source.m4a",
  );

  const sessionsRoot = join(
    testRoot,
    "sessions",
  );

  await writeFile(
    sourcePath,
    Buffer.from(
      "deterministic-test-source",
    ),
  );

  // 1. Session creation + source preservation
  const created = await createSession(
    sessionsRoot,
    sourcePath,
  );

  const preservedSourcePath = join(
    created.sessionDirectory,
    created.metadata.source.relativePath,
  );

  const originalSource =
    await readFile(sourcePath);

  const preservedSourceBefore =
    await readFile(
      preservedSourcePath,
    );

  assert.equal(
    sha256(preservedSourceBefore),
    sha256(originalSource),
    "Preserved source must match imported source",
  );

  // 2. Raw transcript persistence
  const rawTranscript: RawTranscript = {
    schemaVersion: 1,
    sessionId:
      created.metadata.sessionId,
    source: {
      relativePath:
        created.metadata.source
          .relativePath,
    },
    asr: {
      engine: "test-asr",
      model: "deterministic-model",
      language: "sv",
    },
    segments: [
      {
        startMs: 0,
        endMs: 1000,
        text: "Rå transkribering.",
      },
    ],
  };

  await persistRawTranscript(
    created.sessionDirectory,
    rawTranscript,
  );

  const rawPath = join(
    created.sessionDirectory,
    "raw-transcript.json",
  );

  const rawBeforeReopen =
    await readFile(rawPath);

  // 3. Raw overwrite rejection
  await assert.rejects(
    persistRawTranscript(
      created.sessionDirectory,
      rawTranscript,
    ),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "EEXIST",
    "Raw transcript overwrite must be rejected",
  );

  // 4. Reopen
  const reopened =
    await reopenSession(
      created.sessionDirectory,
    );

  assert.equal(
    reopened.metadata.sessionId,
    created.metadata.sessionId,
  );

  assert.deepEqual(
    reopened.rawTranscript,
    rawTranscript,
  );

  // 5. Source/raw unchanged over reopen
  const preservedSourceAfter =
    await readFile(
      preservedSourcePath,
    );

  const rawAfterReopen =
    await readFile(rawPath);

  assert.equal(
    sha256(preservedSourceAfter),
    sha256(preservedSourceBefore),
    "Source must not change during reopen",
  );

  assert.equal(
    sha256(rawAfterReopen),
    sha256(rawBeforeReopen),
    "Raw transcript must not change during reopen",
  );

  // 6. Raw / edited separation
  await saveEditedTranscript(
    created.sessionDirectory,
    {
      schemaVersion: 1,
      sessionId:
        created.metadata.sessionId,
      source: {
        relativePath:
          created.metadata.source
            .relativePath,
      },
      basedOnRawTranscript: {
        relativePath:
          "raw-transcript.json",
      },
      updatedAt:
        "2026-08-17T00:00:00.000Z",
      text:
        "Redigerad transkribering.",
    },
  );

  const reopenedWithEdit =
    await reopenSession(
      created.sessionDirectory,
    );

  assert.equal(
    reopenedWithEdit
      .rawTranscript
      .segments[0]
      ?.text,
    "Rå transkribering.",
    "Editing must not modify raw transcript",
  );

  assert.equal(
    reopenedWithEdit
      .editedTranscript
      ?.text,
    "Redigerad transkribering.",
  );

  // 7. TXT export uses edited transcript without modifying raw
  const rawBeforeExport =
    await readFile(rawPath);

  const exportPath = join(
    created.sessionDirectory,
    "export.txt",
  );

  await exportTranscriptToTxt(
    created.sessionDirectory,
    exportPath,
  );

  const exportedText =
    await readFile(
      exportPath,
      "utf8",
    );

  const rawAfterExport =
    await readFile(rawPath);

  assert.equal(
    exportedText,
    "Redigerad transkribering.",
    "TXT export must prefer edited transcript when it exists",
  );

  assert.equal(
    sha256(rawAfterExport),
    sha256(rawBeforeExport),
    "TXT export must not modify raw transcript",
  );

  // 8. sessionId mismatch rejection
  const mismatchedRaw = {
    ...rawTranscript,
    sessionId:
      "WRONG-SESSION-ID",
  };

  await writeFile(
    rawPath,
    JSON.stringify(
      mismatchedRaw,
      null,
      2,
    ),
    "utf8",
  );

  await assert.rejects(
    reopenSession(
      created.sessionDirectory,
    ),
    /Session ID mismatch/,
    "Mismatched session IDs must be rejected",
  );

  // Restore valid raw transcript
  await writeFile(
    rawPath,
    JSON.stringify(
      rawTranscript,
      null,
      2,
    ),
    "utf8",
  );

  // 9. Raw source provenance mismatch rejection
  const mismatchedSourceRaw = {
    ...rawTranscript,
    source: {
      relativePath:
        "source\\WRONG-SOURCE.m4a",
    },
  };

  await writeFile(
    rawPath,
    JSON.stringify(
      mismatchedSourceRaw,
      null,
      2,
    ),
    "utf8",
  );

  await assert.rejects(
    reopenSession(
      created.sessionDirectory,
    ),
    /Source path mismatch/,
    "Mismatched raw source provenance must be rejected",
  );

  // Restore valid raw transcript
  await writeFile(
    rawPath,
    JSON.stringify(
      rawTranscript,
      null,
      2,
    ),
    "utf8",
  );

  // 10. Edited source provenance mismatch rejection
  const editedPath = join(
    created.sessionDirectory,
    "edited-transcript.json",
  );

  const mismatchedEditedSource = {
    schemaVersion: 1,
    sessionId:
      created.metadata.sessionId,
    source: {
      relativePath:
        "source\\WRONG-SOURCE.m4a",
    },
    basedOnRawTranscript: {
      relativePath:
        "raw-transcript.json",
    },
    updatedAt:
      "2026-08-17T00:00:00.000Z",
    text:
      "Redigerad transkribering.",
  };

  await writeFile(
    editedPath,
    JSON.stringify(
      mismatchedEditedSource,
      null,
      2,
    ),
    "utf8",
  );

  await assert.rejects(
    reopenSession(
      created.sessionDirectory,
    ),
    /Source path mismatch/,
    "Mismatched edited source provenance must be rejected",
  );

  // 11. Edited raw transcript reference mismatch rejection
  const mismatchedRawReference = {
    schemaVersion: 1,
    sessionId:
      created.metadata.sessionId,
    source: {
      relativePath:
        created.metadata.source
          .relativePath,
    },
    basedOnRawTranscript: {
      relativePath:
        "wrong-raw-transcript.json",
    },
    updatedAt:
      "2026-08-17T00:00:00.000Z",
    text:
      "Redigerad transkribering.",
  };

  await writeFile(
    editedPath,
    JSON.stringify(
      mismatchedRawReference,
      null,
      2,
    ),
    "utf8",
  );

  await assert.rejects(
    reopenSession(
      created.sessionDirectory,
    ),
    /invalid raw transcript reference/,
    "Edited transcript must reference raw-transcript.json",
  );

  console.log(
    "PASS: persistence/provenance regression test",
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