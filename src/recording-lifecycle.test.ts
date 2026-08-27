import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createRecordingTarget,
  finalizeRecording,
  renameRecording,
  reopenRecording,
} from "./recording-persistence.js";

import {
  verifyRecordingSourceDuplicate,
} from "./recording-storage.js";

const testRoot =
  await mkdtemp(
    join(
      tmpdir(),
      "evidence-transcriber-recording-lifecycle-",
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

try {
  // ==========================================================
  // 1. New recording starts present
  // ==========================================================

  const target =
    await createRecordingTarget(
      recordingsRoot,
    );

  await writeFile(
    target.sourcePath,
    Buffer.from(
      "lifecycle-source",
    ),
  );

  const finalized =
    await finalizeRecording(
      target,
    );

  assert.equal(
    finalized.source.availability,
    "present",
  );

  const metadataPath =
    join(
      target.recordingDirectory,
      "recording.json",
    );

  // ==========================================================
  // 2. Legacy metadata without availability normalizes present
  // ==========================================================

  const legacyMetadata =
    JSON.parse(
      await readFile(
        metadataPath,
        "utf8",
      ),
    );

  delete legacyMetadata
    .source.availability;

  await writeFile(
    metadataPath,
    JSON.stringify(
      legacyMetadata,
      null,
      2,
    ),
    "utf8",
  );

  const reopenedLegacy =
    await reopenRecording(
      target.recordingDirectory,
    );

  assert.equal(
    reopenedLegacy.source.availability,
    "present",
  );

  // ==========================================================
  // 3. Simulate valid released metadata
  // TEMP FIXTURE ONLY
  // ==========================================================

  const releasedMetadata =
    JSON.parse(
      await readFile(
        metadataPath,
        "utf8",
      ),
    );

  releasedMetadata.transcriptionStatus =
    "transcribed";

  releasedMetadata.transcriptionSessionId =
    "session-test-123";

  releasedMetadata.source.availability =
    "released_to_session";

  releasedMetadata.source.releasedAt =
    "2026-08-27T12:00:00.000Z";

  releasedMetadata.source.releasedToSessionId =
    "session-test-123";

  releasedMetadata.source.verifiedSha256 =
    "a".repeat(64);

  await writeFile(
    metadataPath,
    JSON.stringify(
      releasedMetadata,
      null,
      2,
    ),
    "utf8",
  );

  // Delete ONLY temporary fixture source.
  await rm(
    target.sourcePath,
  );

  const reopenedReleased =
    await reopenRecording(
      target.recordingDirectory,
    );

  assert.equal(
    reopenedReleased.source.availability,
    "released_to_session",
  );

  assert.equal(
    reopenedReleased
      .source.releasedToSessionId,
    "session-test-123",
  );

  assert.equal(
    reopenedReleased
      .source.verifiedSha256,
    "a".repeat(64),
  );

  // ==========================================================
  // 4. Metadata operations still work after release
  // ==========================================================

  const renamed =
    await renameRecording(
      target.recordingDirectory,
      "Released recording",
    );

  assert.equal(
    renamed.displayName,
    "Released recording",
  );

  assert.equal(
    renamed.source.availability,
    "released_to_session",
  );

  // ==========================================================
  // 5. Duplicate verifier rejects released source
  // ==========================================================

  await assert.rejects(
    verifyRecordingSourceDuplicate(
      target.recordingDirectory,
      sessionsRoot,
    ),
    /Recording source is not present/,
  );

  // ==========================================================
  // 6. Invalid released state fails closed
  // ==========================================================

  const invalidTarget =
    await createRecordingTarget(
      recordingsRoot,
    );

  await writeFile(
    invalidTarget.sourcePath,
    Buffer.from(
      "invalid-release",
    ),
  );

  await finalizeRecording(
    invalidTarget,
  );

  const invalidMetadataPath =
    join(
      invalidTarget.recordingDirectory,
      "recording.json",
    );

  const invalidMetadata =
    JSON.parse(
      await readFile(
        invalidMetadataPath,
        "utf8",
      ),
    );

  invalidMetadata.source.availability =
    "released_to_session";

  invalidMetadata.source.releasedAt =
    "2026-08-27T12:00:00.000Z";

  invalidMetadata.source.releasedToSessionId =
    "fake-session";

  invalidMetadata.source.verifiedSha256 =
    "0".repeat(64);

  await writeFile(
    invalidMetadataPath,
    JSON.stringify(
      invalidMetadata,
      null,
      2,
    ),
    "utf8",
  );

  await rm(
    invalidTarget.sourcePath,
  );

  await assert.rejects(
    reopenRecording(
      invalidTarget.recordingDirectory,
    ),
    /must be linked to a transcribed session/,
  );

  console.log(
    "PASS: recording source lifecycle regression test",
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
