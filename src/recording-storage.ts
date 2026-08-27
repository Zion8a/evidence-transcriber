import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  rm,
  stat,
} from "node:fs/promises";
import { join } from "node:path";

import {
  reopenSession,
} from "./persistence.js";

import {
  markRecordingSourceReleased,
  markRecordingSourceReleasePending,
  reopenRecording,
  type RecordingMetadata,
} from "./recording-persistence.js";

async function sha256File(
  path: string,
): Promise<string> {
  const hash =
    createHash("sha256");

  for await (
    const chunk
    of createReadStream(path)
  ) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

function isFileNotFoundError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export interface VerifiedRecordingSourceDuplicate {
  recordingId: string;
  sessionId: string;
  recordingSourcePath: string;
  sessionSourcePath: string;
  sizeBytes: number;
  sha256: string;
}

export interface ReleasedRecordingSource {
  recordingId: string;
  sessionId: string;
  releasedBytes: number;
  sha256: string;
  availability:
    "released_to_session";
}

export async function verifyRecordingSourceDuplicate(
  recordingDirectory: string,
  sessionsRoot: string,
): Promise<VerifiedRecordingSourceDuplicate> {
  const recording =
    await reopenRecording(
      recordingDirectory,
    );

  const sourceAvailability =
    recording.source.availability ??
    "present";

  if (
    sourceAvailability !==
    "present"
  ) {
    throw new Error(
      "Recording source is not present.",
    );
  }

  if (
    recording.transcriptionStatus !==
      "transcribed" ||
    !recording.transcriptionSessionId
  ) {
    throw new Error(
      "Recording is not linked to a completed transcription session.",
    );
  }

  const sessionId =
    recording.transcriptionSessionId;

  const sessionDirectory =
    join(
      sessionsRoot,
      sessionId,
    );

  const session =
    await reopenSession(
      sessionDirectory,
    );

  if (
    session.metadata.sessionId !==
    sessionId
  ) {
    throw new Error(
      "Linked session identity mismatch.",
    );
  }

  const recordingSourcePath =
    join(
      recordingDirectory,
      recording.source.relativePath,
    );

  const sessionSourcePath =
    join(
      sessionDirectory,
      session.metadata.source.relativePath,
    );

  let sessionSourceStats;

  try {
    sessionSourceStats =
      await stat(
        sessionSourcePath,
      );
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw new Error(
        "Linked session source is missing.",
      );
    }

    throw error;
  }

  if (!sessionSourceStats.isFile()) {
    throw new Error(
      "Linked session source is not a file.",
    );
  }

  if (
    sessionSourceStats.size !==
    recording.source.sizeBytes
  ) {
    throw new Error(
      `Source size mismatch: recording=${recording.source.sizeBytes}, session=${sessionSourceStats.size}.`,
    );
  }

  const recordingHash =
    await sha256File(
      recordingSourcePath,
    );

  const sessionHash =
    await sha256File(
      sessionSourcePath,
    );

  if (
    recordingHash !==
    sessionHash
  ) {
    throw new Error(
      "Source SHA-256 mismatch.",
    );
  }

  return {
    recordingId:
      recording.recordingId,
    sessionId,
    recordingSourcePath,
    sessionSourcePath,
    sizeBytes:
      recording.source.sizeBytes,
    sha256:
      recordingHash,
  };
}

async function verifyCanonicalSessionSource(
  recording: RecordingMetadata,
  sessionsRoot: string,
): Promise<string> {
  const sessionId =
    recording.transcriptionSessionId;

  if (!sessionId) {
    throw new Error(
      "Recording has no linked transcription session.",
    );
  }

  const expectedHash =
    recording.source.verifiedSha256;

  if (!expectedHash) {
    throw new Error(
      "Recording release proof is missing.",
    );
  }

  const sessionDirectory =
    join(
      sessionsRoot,
      sessionId,
    );

  const session =
    await reopenSession(
      sessionDirectory,
    );

  if (
    session.metadata.sessionId !==
    sessionId
  ) {
    throw new Error(
      "Linked session identity mismatch.",
    );
  }

  const sessionSourcePath =
    join(
      sessionDirectory,
      session.metadata.source.relativePath,
    );

  let sourceStats;

  try {
    sourceStats =
      await stat(
        sessionSourcePath,
      );
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw new Error(
        "Canonical session source is missing.",
      );
    }

    throw error;
  }

  if (!sourceStats.isFile()) {
    throw new Error(
      "Canonical session source is not a file.",
    );
  }

  if (
    sourceStats.size !==
    recording.source.sizeBytes
  ) {
    throw new Error(
      "Canonical session source size mismatch.",
    );
  }

  const sessionHash =
    await sha256File(
      sessionSourcePath,
    );

  if (
    sessionHash !==
    expectedHash
  ) {
    throw new Error(
      "Canonical session source SHA-256 mismatch.",
    );
  }

  return sessionSourcePath;
}

function releasedResult(
  metadata: RecordingMetadata,
): ReleasedRecordingSource {
  if (
    !metadata.transcriptionSessionId ||
    !metadata.source.verifiedSha256
  ) {
    throw new Error(
      "Released recording metadata is incomplete.",
    );
  }

  return {
    recordingId:
      metadata.recordingId,
    sessionId:
      metadata.transcriptionSessionId,
    releasedBytes:
      metadata.source.sizeBytes,
    sha256:
      metadata.source.verifiedSha256,
    availability:
      "released_to_session",
  };
}

export async function releaseRecordingSourceDuplicate(
  recordingDirectory: string,
  sessionsRoot: string,
): Promise<ReleasedRecordingSource> {
  const verified =
    await verifyRecordingSourceDuplicate(
      recordingDirectory,
      sessionsRoot,
    );

  await markRecordingSourceReleasePending(
    recordingDirectory,
    verified.sessionId,
    verified.sha256,
  );

  // Use the same verified recovery path for both
  // normal execution and interrupted releases.
  // This re-checks canonical provenance and the
  // duplicate immediately before deletion.
  return resumeRecordingSourceRelease(
    recordingDirectory,
    sessionsRoot,
  );
}

export async function resumeRecordingSourceRelease(
  recordingDirectory: string,
  sessionsRoot: string,
): Promise<ReleasedRecordingSource> {
  const recording =
    await reopenRecording(
      recordingDirectory,
    );

  if (
    recording.source.availability !==
    "release_pending"
  ) {
    throw new Error(
      "Recording source release is not pending.",
    );
  }

  // Never touch the duplicate until the canonical
  // session copy still matches the stored release proof.
  await verifyCanonicalSessionSource(
    recording,
    sessionsRoot,
  );

  const recordingSourcePath =
    join(
      recordingDirectory,
      recording.source.relativePath,
    );

  try {
    const recordingSourceStats =
      await stat(
        recordingSourcePath,
      );

    if (!recordingSourceStats.isFile()) {
      throw new Error(
        "Pending recording source is not a file.",
      );
    }

    if (
      recordingSourceStats.size !==
      recording.source.sizeBytes
    ) {
      throw new Error(
        "Pending recording source size mismatch.",
      );
    }

    const recordingHash =
      await sha256File(
        recordingSourcePath,
      );

    if (
      recordingHash !==
      recording.source.verifiedSha256
    ) {
      throw new Error(
        "Pending recording source no longer matches verified SHA-256.",
      );
    }

    await rm(
      recordingSourcePath,
    );
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }

    // Missing is valid here:
    // an earlier process may have removed the duplicate
    // and crashed before final metadata was persisted.
  }

  const released =
    await markRecordingSourceReleased(
      recordingDirectory,
    );

  return releasedResult(
    released,
  );
}
