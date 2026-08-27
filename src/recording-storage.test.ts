import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createSession,
  persistRawTranscript,
  type RawTranscript,
} from "./persistence.js";

import {
  createRecordingTarget,
  finalizeRecording,
  markRecordingTranscribed,
} from "./recording-persistence.js";

import {
  verifyRecordingSourceDuplicate,
} from "./recording-storage.js";

const testRoot =
  await mkdtemp(
    join(
      tmpdir(),
      "evidence-transcriber-recording-storage-",
    ),
  );

const recordingsRoot =
  join(
    testRoot,
    "recordings",
  );

const sessionsRoot =
  join(
    testRoot,
    "sessions",
  );

async function createLinkedFixture(
  bytes: Buffer,
) {
  const target =
    await createRecordingTarget(
      recordingsRoot,
    );

  await writeFile(
    target.sourcePath,
    bytes,
  );

  await finalizeRecording(
    target,
  );

  const session =
    await createSession(
      sessionsRoot,
      target.sourcePath,
    );

  const raw:
    RawTranscript = {
      schemaVersion: 1,
      sessionId:
        session.metadata.sessionId,
      source: {
        relativePath:
          session.metadata.source.relativePath,
      },
      asr: {
        engine: "test",
        provider: "local",
        model: "test",
        language: "sv",
        timingMode: "segments",
      },
      segments: [],
    };

  await persistRawTranscript(
    session.sessionDirectory,
    raw,
  );

  await markRecordingTranscribed(
    target.recordingDirectory,
    session.metadata.sessionId,
  );

  return {
    target,
    session,
  };
}

try {
  // ==========================================================
  // 1. Identical recording/session sources must verify
  // ==========================================================

  const verifiedFixture =
    await createLinkedFixture(
      Buffer.from(
        "ABCDEFGHIJ",
      ),
    );

  const verified =
    await verifyRecordingSourceDuplicate(
      verifiedFixture.target
        .recordingDirectory,
      sessionsRoot,
    );

  assert.equal(
    verified.recordingId,
    verifiedFixture.target.recordingId,
  );

  assert.equal(
    verified.sessionId,
    verifiedFixture.session.metadata
      .sessionId,
  );

  assert.equal(
    verified.sizeBytes,
    10,
  );

  assert.match(
    verified.sha256,
    /^[a-f0-9]{64}$/,
  );

  // ==========================================================
  // 2. Untranscribed recording must be rejected
  // ==========================================================

  const untranscribedTarget =
    await createRecordingTarget(
      recordingsRoot,
    );

  await writeFile(
    untranscribedTarget.sourcePath,
    Buffer.from(
      "UNTRANSCRIBED",
    ),
  );

  await finalizeRecording(
    untranscribedTarget,
  );

  await assert.rejects(
    verifyRecordingSourceDuplicate(
      untranscribedTarget.recordingDirectory,
      sessionsRoot,
    ),
    /not linked to a completed transcription session/,
  );

  // ==========================================================
  // 3. Missing linked session source must be rejected
  // ==========================================================

  const missingFixture =
    await createLinkedFixture(
      Buffer.from(
        "1234567890",
      ),
    );

  const missingSessionSource =
    join(
      missingFixture.session.sessionDirectory,
      missingFixture.session.metadata
        .source.relativePath,
    );

  await rm(
    missingSessionSource,
  );

  await assert.rejects(
    verifyRecordingSourceDuplicate(
      missingFixture.target
        .recordingDirectory,
      sessionsRoot,
    ),
    /Linked session source is missing/,
  );

  // ==========================================================
  // 4. Same-size but different bytes must fail SHA-256
  // ==========================================================

  const mismatchFixture =
    await createLinkedFixture(
      Buffer.from(
        "abcdefghij",
      ),
    );

  const mismatchSessionSource =
    join(
      mismatchFixture.session.sessionDirectory,
      mismatchFixture.session.metadata
        .source.relativePath,
    );

  await writeFile(
    mismatchSessionSource,
    Buffer.from(
      "0123456789",
    ),
  );

  await assert.rejects(
    verifyRecordingSourceDuplicate(
      mismatchFixture.target
        .recordingDirectory,
      sessionsRoot,
    ),
    /Source SHA-256 mismatch/,
  );

  console.log(
    "PASS: recording source duplicate verification",
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
