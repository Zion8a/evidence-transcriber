import {
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  join,
  relative,
} from "node:path";
import { randomUUID } from "node:crypto";

export type RecordingSourceAvailability =
  | "present"
  | "release_pending"
  | "released_to_session";

export interface RecordingMetadata {
  schemaVersion: 1;
  recordingId: string;
  createdAt: string;
  displayName?: string;
  sourceType: "recorded";
  captureMode: "system+microphone";
  transcriptionStatus:
    | "not_transcribed"
    | "transcribed";
  transcriptionSessionId?: string;
  source: {
    storedName: string;
    relativePath: string;
    sizeBytes: number;
    availability?:
      RecordingSourceAvailability;
    releaseStartedAt?: string;
    releasedAt?: string;
    releasedToSessionId?: string;
    verifiedSha256?: string;
  };
}

export interface RecordingTarget {
  recordingId: string;
  recordingDirectory: string;
  sourcePath: string;
  createdAt: string;
}

export async function createRecordingTarget(
  recordingsRoot: string,
): Promise<RecordingTarget> {
  const recordingId =
    randomUUID();

  const recordingDirectory =
    join(
      recordingsRoot,
      recordingId,
    );

  const sourceDirectory =
    join(
      recordingDirectory,
      "source",
    );

  await mkdir(
    sourceDirectory,
    {
      recursive: true,
    },
  );

  return {
    recordingId,
    recordingDirectory,
    sourcePath:
      join(
        sourceDirectory,
        "recording.wav",
      ),
    createdAt:
      new Date().toISOString(),
  };
}

export async function finalizeRecording(
  target: RecordingTarget,
): Promise<RecordingMetadata> {
  const sourceStats =
    await stat(
      target.sourcePath,
    );

  if (!sourceStats.isFile()) {
    throw new Error(
      `Recorded source is not a file: ${target.sourcePath}`,
    );
  }

  if (sourceStats.size === 0) {
    throw new Error(
      "Recorded source is empty.",
    );
  }

  const metadata: RecordingMetadata = {
    schemaVersion: 1,
    recordingId:
      target.recordingId,
    createdAt:
      target.createdAt,
    sourceType:
      "recorded",
    captureMode:
      "system+microphone",
    transcriptionStatus:
      "not_transcribed",
    source: {
      storedName:
        "recording.wav",
      relativePath:
        relative(
          target.recordingDirectory,
          target.sourcePath,
        ),
      sizeBytes:
        sourceStats.size,
      availability:
        "present",
    },
  };

  await writeFile(
    join(
      target.recordingDirectory,
      "recording.json",
    ),
    JSON.stringify(
      metadata,
      null,
      2,
    ),
    {
      encoding: "utf8",
      flag: "wx",
    },
  );

  return metadata;
}

export async function reopenRecording(
  recordingDirectory: string,
): Promise<RecordingMetadata> {
  const json =
    await readFile(
      join(
        recordingDirectory,
        "recording.json",
      ),
      "utf8",
    );

  const metadata =
    JSON.parse(
      json,
    ) as RecordingMetadata;

  const rawAvailability =
    metadata.source.availability;

  if (
    rawAvailability !== undefined &&
    rawAvailability !== "present" &&
    rawAvailability !==
      "release_pending" &&
    rawAvailability !==
      "released_to_session"
  ) {
    throw new Error(
      "Recording source has an invalid availability state.",
    );
  }

  // Backwards compatibility:
  // older recordings have no availability field.
  const availability:
    RecordingSourceAvailability =
      rawAvailability ??
      "present";

  const normalizedMetadata:
    RecordingMetadata = {
      ...metadata,
      source: {
        ...metadata.source,
        availability,
      },
    };

  if (
    availability ===
      "release_pending" ||
    availability ===
      "released_to_session"
  ) {
    if (
      normalizedMetadata
        .transcriptionStatus !==
        "transcribed" ||
      !normalizedMetadata
        .transcriptionSessionId
    ) {
      throw new Error(
        "Released recording source must be linked to a transcribed session.",
      );
    }

    if (
      normalizedMetadata
        .source.releasedToSessionId !==
      normalizedMetadata
        .transcriptionSessionId
    ) {
      throw new Error(
        "Released recording source session link mismatch.",
      );
    }

    if (
      !normalizedMetadata
        .source.verifiedSha256 ||
      !/^[a-f0-9]{64}$/.test(
        normalizedMetadata
          .source.verifiedSha256,
      )
    ) {
      throw new Error(
        "Released recording source is missing a valid verified SHA-256.",
      );
    }

    if (
      availability ===
      "release_pending"
    ) {
      if (
        !normalizedMetadata
          .source.releaseStartedAt
      ) {
        throw new Error(
          "Pending recording source release is missing releaseStartedAt.",
        );
      }

      // The source may still exist, or it may already
      // have been removed before an interrupted finalization.
      return normalizedMetadata;
    }

    if (
      !normalizedMetadata
        .source.releasedAt
    ) {
      throw new Error(
        "Released recording source is missing releasedAt.",
      );
    }

    return normalizedMetadata;
  }
  const sourcePath =
    join(
      recordingDirectory,
      normalizedMetadata
        .source.relativePath,
    );

  const sourceStats =
    await stat(
      sourcePath,
    );

  if (!sourceStats.isFile()) {
    throw new Error(
      "Recorded source is missing.",
    );
  }

  if (
    sourceStats.size !==
    normalizedMetadata
      .source.sizeBytes
  ) {
    throw new Error(
      `Recorded source size mismatch: expected ${normalizedMetadata.source.sizeBytes}, got ${sourceStats.size}`,
    );
  }

  return normalizedMetadata;
}
async function writeRecordingMetadataAtomic(
  recordingDirectory: string,
  metadata: RecordingMetadata,
): Promise<void> {
  const metadataPath =
    join(
      recordingDirectory,
      "recording.json",
    );

  const temporaryMetadataPath =
    join(
      recordingDirectory,
      "recording.json.tmp",
    );

  await writeFile(
    temporaryMetadataPath,
    JSON.stringify(
      metadata,
      null,
      2,
    ),
    {
      encoding: "utf8",
      flag: "w",
    },
  );

  await rename(
    temporaryMetadataPath,
    metadataPath,
  );
}

export async function markRecordingSourceReleasePending(
  recordingDirectory: string,
  sessionId: string,
  verifiedSha256: string,
  releaseStartedAt =
    new Date().toISOString(),
): Promise<RecordingMetadata> {
  const metadata =
    await reopenRecording(
      recordingDirectory,
    );

  const availability =
    metadata.source.availability ??
    "present";

  if (
    availability !==
    "present"
  ) {
    throw new Error(
      "Recording source is not available for release.",
    );
  }

  if (
    metadata.transcriptionStatus !==
      "transcribed" ||
    metadata.transcriptionSessionId !==
      sessionId
  ) {
    throw new Error(
      "Recording source release session link mismatch.",
    );
  }

  if (
    !/^[a-f0-9]{64}$/.test(
      verifiedSha256,
    )
  ) {
    throw new Error(
      "Recording source release requires a valid SHA-256.",
    );
  }

  const updatedMetadata:
    RecordingMetadata = {
      ...metadata,
      source: {
        ...metadata.source,
        availability:
          "release_pending",
        releaseStartedAt,
        releasedToSessionId:
          sessionId,
        verifiedSha256,
      },
    };

  await writeRecordingMetadataAtomic(
    recordingDirectory,
    updatedMetadata,
  );

  return updatedMetadata;
}

export async function markRecordingSourceReleased(
  recordingDirectory: string,
  releasedAt =
    new Date().toISOString(),
): Promise<RecordingMetadata> {
  const metadata =
    await reopenRecording(
      recordingDirectory,
    );

  if (
    metadata.source.availability !==
    "release_pending"
  ) {
    throw new Error(
      "Recording source release is not pending.",
    );
  }

  const updatedMetadata:
    RecordingMetadata = {
      ...metadata,
      source: {
        ...metadata.source,
        availability:
          "released_to_session",
        releasedAt,
      },
    };

  await writeRecordingMetadataAtomic(
    recordingDirectory,
    updatedMetadata,
  );

  return updatedMetadata;
}
export async function markRecordingTranscribed(
  recordingDirectory: string,
  sessionId: string,
): Promise<RecordingMetadata> {
  const metadata =
    await reopenRecording(
      recordingDirectory,
    );

  if (
    metadata.transcriptionStatus ===
    "transcribed"
  ) {
    if (
      metadata.transcriptionSessionId ===
      sessionId
    ) {
      return metadata;
    }

    throw new Error(
      "Recording is already linked to another transcription session.",
    );
  }

  const updatedMetadata: RecordingMetadata = {
    ...metadata,
    transcriptionStatus:
      "transcribed",
    transcriptionSessionId:
      sessionId,
  };

  const metadataPath =
    join(
      recordingDirectory,
      "recording.json",
    );

  const temporaryMetadataPath =
    join(
      recordingDirectory,
      "recording.json.tmp",
    );

  await writeFile(
    temporaryMetadataPath,
    JSON.stringify(
      updatedMetadata,
      null,
      2,
    ),
    {
      encoding: "utf8",
      flag: "w",
    },
  );

  await rename(
    temporaryMetadataPath,
    metadataPath,
  );

  return updatedMetadata;
}
export async function renameRecording(
  recordingDirectory: string,
  displayName: string,
): Promise<RecordingMetadata> {
  const trimmedName =
    displayName.trim();

  if (!trimmedName) {
    throw new Error(
      "Namnet får inte vara tomt.",
    );
  }

  const metadata =
    await reopenRecording(
      recordingDirectory,
    );

  const updatedMetadata: RecordingMetadata = {
    ...metadata,
    displayName:
      trimmedName,
  };

  const metadataPath =
    join(
      recordingDirectory,
      "recording.json",
    );

  const temporaryMetadataPath =
    join(
      recordingDirectory,
      "recording.json.tmp",
    );

  await writeFile(
    temporaryMetadataPath,
    JSON.stringify(
      updatedMetadata,
      null,
      2,
    ),
    {
      encoding: "utf8",
      flag: "w",
    },
  );

  await rename(
    temporaryMetadataPath,
    metadataPath,
  );

  return updatedMetadata;
}
