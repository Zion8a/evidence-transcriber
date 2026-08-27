import assert from "node:assert/strict";
import {
  access,
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
  markRecordingSourceReleasePending,
  markRecordingTranscribed,
  reopenRecording,
} from "./recording-persistence.js";

import {
  releaseRecordingSourceDuplicate,
  resumeRecordingSourceRelease,
  verifyRecordingSourceDuplicate,
} from "./recording-storage.js";

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
      "evidence-transcriber-recording-release-",
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
    sessionSourcePath:
      join(
        session.sessionDirectory,
        session.metadata.source.relativePath,
      ),
  };
}

try {
  // ==========================================================
  // 1. Normal release
  // ==========================================================

  const normal =
    await createLinkedFixture(
      Buffer.from(
        "NORMAL-RELEASE",
      ),
    );

  const normalResult =
    await releaseRecordingSourceDuplicate(
      normal.target.recordingDirectory,
      sessionsRoot,
    );

  assert.equal(
    normalResult.availability,
    "released_to_session",
  );

  assert.equal(
    await exists(
      normal.target.sourcePath,
    ),
    false,
    "Duplicate recording source should be removed",
  );

  assert.equal(
    await exists(
      normal.sessionSourcePath,
    ),
    true,
    "Canonical session source must remain",
  );

  const normalMetadata =
    await reopenRecording(
      normal.target.recordingDirectory,
    );

  assert.equal(
    normalMetadata.source.availability,
    "released_to_session",
  );

  assert.ok(
    normalMetadata.source.releasedAt,
  );

  assert.ok(
    normalMetadata.source.verifiedSha256,
  );

  // ==========================================================
  // 2. Verification failure must not delete or enter pending
  // ==========================================================

  const mismatch =
    await createLinkedFixture(
      Buffer.from(
        "ABCDEFGHIJ",
      ),
    );

  await writeFile(
    mismatch.sessionSourcePath,
    Buffer.from(
      "0123456789",
    ),
  );

  await assert.rejects(
    releaseRecordingSourceDuplicate(
      mismatch.target.recordingDirectory,
      sessionsRoot,
    ),
    /Source SHA-256 mismatch/,
  );

  assert.equal(
    await exists(
      mismatch.target.sourcePath,
    ),
    true,
  );

  const mismatchMetadata =
    await reopenRecording(
      mismatch.target.recordingDirectory,
    );

  assert.equal(
    mismatchMetadata.source.availability,
    "present",
  );

  // ==========================================================
  // 3. Crash simulation:
  // pending metadata exists, duplicate still exists
  // ==========================================================

  const beforeDelete =
    await createLinkedFixture(
      Buffer.from(
        "BEFORE-DELETE",
      ),
    );

  const beforeDeleteProof =
    await verifyRecordingSourceDuplicate(
      beforeDelete.target
        .recordingDirectory,
      sessionsRoot,
    );

  await markRecordingSourceReleasePending(
    beforeDelete.target
      .recordingDirectory,
    beforeDeleteProof.sessionId,
    beforeDeleteProof.sha256,
    "2026-08-27T13:00:00.000Z",
  );

  assert.equal(
    await exists(
      beforeDelete.target.sourcePath,
    ),
    true,
  );

  const resumedBeforeDelete =
    await resumeRecordingSourceRelease(
      beforeDelete.target
        .recordingDirectory,
      sessionsRoot,
    );

  assert.equal(
    resumedBeforeDelete.availability,
    "released_to_session",
  );

  assert.equal(
    await exists(
      beforeDelete.target.sourcePath,
    ),
    false,
  );

  assert.equal(
    await exists(
      beforeDelete.sessionSourcePath,
    ),
    true,
  );

  // ==========================================================
  // 4. Crash simulation:
  // duplicate already removed, metadata still pending
  // ==========================================================

  const afterDelete =
    await createLinkedFixture(
      Buffer.from(
        "AFTER-DELETE",
      ),
    );

  const afterDeleteProof =
    await verifyRecordingSourceDuplicate(
      afterDelete.target
        .recordingDirectory,
      sessionsRoot,
    );

  await markRecordingSourceReleasePending(
    afterDelete.target
      .recordingDirectory,
    afterDeleteProof.sessionId,
    afterDeleteProof.sha256,
    "2026-08-27T13:01:00.000Z",
  );

  await rm(
    afterDelete.target.sourcePath,
  );

  const pendingAfterDelete =
    await reopenRecording(
      afterDelete.target
        .recordingDirectory,
    );

  assert.equal(
    pendingAfterDelete.source.availability,
    "release_pending",
  );

  const resumedAfterDelete =
    await resumeRecordingSourceRelease(
      afterDelete.target
        .recordingDirectory,
      sessionsRoot,
    );

  assert.equal(
    resumedAfterDelete.availability,
    "released_to_session",
  );

  assert.equal(
    await exists(
      afterDelete.sessionSourcePath,
    ),
    true,
  );

  // ==========================================================
  // 5. Pending duplicate changed after verification:
  // fail closed and preserve it
  // ==========================================================

  const changedDuplicate =
    await createLinkedFixture(
      Buffer.from(
        "abcdefghij",
      ),
    );

  const changedProof =
    await verifyRecordingSourceDuplicate(
      changedDuplicate.target
        .recordingDirectory,
      sessionsRoot,
    );

  await markRecordingSourceReleasePending(
    changedDuplicate.target
      .recordingDirectory,
    changedProof.sessionId,
    changedProof.sha256,
  );

  await writeFile(
    changedDuplicate.target.sourcePath,
    Buffer.from(
      "0123456789",
    ),
  );

  await assert.rejects(
    resumeRecordingSourceRelease(
      changedDuplicate.target
        .recordingDirectory,
      sessionsRoot,
    ),
    /no longer matches verified SHA-256/,
  );

  assert.equal(
    await exists(
      changedDuplicate.target.sourcePath,
    ),
    true,
  );

  const changedMetadata =
    await reopenRecording(
      changedDuplicate.target
        .recordingDirectory,
    );

  assert.equal(
    changedMetadata.source.availability,
    "release_pending",
  );

  // ==========================================================
  // 6. Canonical session source changed after verification:
  // fail closed before duplicate deletion
  // ==========================================================

  const changedCanonical =
    await createLinkedFixture(
      Buffer.from(
        "KLMNOPQRST",
      ),
    );

  const canonicalProof =
    await verifyRecordingSourceDuplicate(
      changedCanonical.target
        .recordingDirectory,
      sessionsRoot,
    );

  await markRecordingSourceReleasePending(
    changedCanonical.target
      .recordingDirectory,
    canonicalProof.sessionId,
    canonicalProof.sha256,
  );

  await writeFile(
    changedCanonical.sessionSourcePath,
    Buffer.from(
      "9876543210",
    ),
  );

  await assert.rejects(
    resumeRecordingSourceRelease(
      changedCanonical.target
        .recordingDirectory,
      sessionsRoot,
    ),
    /Canonical session source SHA-256 mismatch/,
  );

  assert.equal(
    await exists(
      changedCanonical.target.sourcePath,
    ),
    true,
    "Duplicate must remain if canonical provenance fails verification",
  );

  console.log(
    "PASS: crash-safe recording source release regression test",
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
