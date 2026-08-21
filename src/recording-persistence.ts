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

  const sourcePath =
    join(
      recordingDirectory,
      metadata.source.relativePath,
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
    metadata.source.sizeBytes
  ) {
    throw new Error(
      `Recorded source size mismatch: expected ${metadata.source.sizeBytes}, got ${sourceStats.size}`,
    );
  }

  return metadata;
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
