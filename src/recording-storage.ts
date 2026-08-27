import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";

import {
  reopenSession,
} from "./persistence.js";

import {
  reopenRecording,
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

export interface VerifiedRecordingSourceDuplicate {
  recordingId: string;
  sessionId: string;
  recordingSourcePath: string;
  sessionSourcePath: string;
  sizeBytes: number;
  sha256: string;
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
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
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
