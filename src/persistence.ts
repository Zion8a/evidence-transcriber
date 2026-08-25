import {
  copyFile,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { randomUUID } from "node:crypto";

export interface SessionSourceMetadata {
  originalName: string;
  storedName: string;
  relativePath: string;
  sizeBytes: number;
}

export interface SessionMetadata {
  schemaVersion: 1;
  sessionId: string;
  createdAt: string;
  displayName?: string;
  source: SessionSourceMetadata;
}

export interface CreateSessionResult {
  sessionDirectory: string;
  metadata: SessionMetadata;
}

export interface RawTranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface RawTranscript {
  schemaVersion: 1;
  sessionId: string;
  source: {
    relativePath: string;
  };
  asr: {
    engine: string;
    provider?: string;
    model: string;
    language: string;
    timingMode?: "segments" | "none";
  };
  text?: string;
  segments: RawTranscriptSegment[];
}

export interface EditedTranscript {
  schemaVersion: 1;
  sessionId: string;
  source: {
    relativePath: string;
  };
  basedOnRawTranscript: {
    relativePath: string;
  };
  updatedAt: string;
  text: string;
}

export interface ReopenedSession {
  metadata: SessionMetadata;
  rawTranscript: RawTranscript;
  editedTranscript?: EditedTranscript;
}

export async function createSession(
  sessionsRoot: string,
  sourcePath: string,
): Promise<CreateSessionResult> {
  const sourceStats = await stat(sourcePath);

  if (!sourceStats.isFile()) {
    throw new Error(
      `Source path is not a file: ${sourcePath}`,
    );
  }

  const sessionId = randomUUID();
  const sessionDirectory = join(
    sessionsRoot,
    sessionId,
  );
  const sourceDirectory = join(
    sessionDirectory,
    "source",
  );

  await mkdir(sessionsRoot, {
    recursive: true,
  });

  await mkdir(sessionDirectory, {
    recursive: false,
  });

  await mkdir(sourceDirectory, {
    recursive: false,
  });

  const originalName = basename(sourcePath);
  const storedName = originalName;

  const preservedSourcePath = join(
    sourceDirectory,
    storedName,
  );

  await copyFile(
    sourcePath,
    preservedSourcePath,
  );

  const preservedStats = await stat(
    preservedSourcePath,
  );

  if (
    preservedStats.size !==
    sourceStats.size
  ) {
    throw new Error(
      `Preserved source size mismatch: expected ${sourceStats.size}, got ${preservedStats.size}`,
    );
  }

  const metadata: SessionMetadata = {
    schemaVersion: 1,
    sessionId,
    createdAt:
      new Date().toISOString(),
    source: {
      originalName,
      storedName,
      relativePath: relative(
        sessionDirectory,
        preservedSourcePath,
      ),
      sizeBytes:
        preservedStats.size,
    },
  };

  await writeFile(
    join(
      sessionDirectory,
      "session.json",
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

  return {
    sessionDirectory,
    metadata,
  };
}

export async function persistRawTranscript(
  sessionDirectory: string,
  transcript: RawTranscript,
): Promise<string> {
  const transcriptPath = join(
    sessionDirectory,
    "raw-transcript.json",
  );

  await writeFile(
    transcriptPath,
    JSON.stringify(
      transcript,
      null,
      2,
    ),
    {
      encoding: "utf8",
      flag: "wx",
    },
  );

  return transcriptPath;
}

export async function saveEditedTranscript(
  sessionDirectory: string,
  transcript: EditedTranscript,
): Promise<string> {
  const transcriptPath = join(
    sessionDirectory,
    "edited-transcript.json",
  );

  await writeFile(
    transcriptPath,
    JSON.stringify(
      transcript,
      null,
      2,
    ),
    {
      encoding: "utf8",
      flag: "w",
    },
  );

  return transcriptPath;
}

export async function reopenSession(
  sessionDirectory: string,
): Promise<ReopenedSession> {
  const sessionJson = await readFile(
    join(
      sessionDirectory,
      "session.json",
    ),
    "utf8",
  );

  const rawTranscriptJson =
    await readFile(
      join(
        sessionDirectory,
        "raw-transcript.json",
      ),
      "utf8",
    );

  const metadata =
    JSON.parse(
      sessionJson,
    ) as SessionMetadata;

  const rawTranscript =
    JSON.parse(
      rawTranscriptJson,
    ) as RawTranscript;

  if (
    metadata.sessionId !==
    rawTranscript.sessionId
  ) {
    throw new Error(
      `Session ID mismatch: metadata=${metadata.sessionId}, rawTranscript=${rawTranscript.sessionId}`,
    );
  }

  if (
    metadata.source.relativePath !==
    rawTranscript.source.relativePath
  ) {
    throw new Error(
      `Source path mismatch: metadata=${metadata.source.relativePath}, rawTranscript=${rawTranscript.source.relativePath}`,
    );
  }

  let editedTranscript:
    | EditedTranscript
    | undefined;

  try {
    const editedTranscriptJson =
      await readFile(
        join(
          sessionDirectory,
          "edited-transcript.json",
        ),
        "utf8",
      );

    editedTranscript =
      JSON.parse(
        editedTranscriptJson,
      ) as EditedTranscript;

    if (
      metadata.sessionId !==
      editedTranscript.sessionId
    ) {
      throw new Error(
        `Session ID mismatch: metadata=${metadata.sessionId}, editedTranscript=${editedTranscript.sessionId}`,
      );
    }

    if (
      metadata.source.relativePath !==
      editedTranscript.source.relativePath
    ) {
      throw new Error(
        `Source path mismatch: metadata=${metadata.source.relativePath}, editedTranscript=${editedTranscript.source.relativePath}`,
      );
    }

    if (
      editedTranscript
        .basedOnRawTranscript
        .relativePath !==
      "raw-transcript.json"
    ) {
      throw new Error(
        `Edited transcript has invalid raw transcript reference: ${editedTranscript.basedOnRawTranscript.relativePath}`,
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      editedTranscript = undefined;
    } else {
      throw error;
    }
  }

  return {
    metadata,
    rawTranscript,
    ...(editedTranscript !== undefined
      ? {
          editedTranscript,
        }
      : {}),
  };
}

export async function exportTranscriptToTxt(
  sessionDirectory: string,
  outputPath: string,
): Promise<string> {
  const reopened =
    await reopenSession(
      sessionDirectory,
    );

  const text =
    reopened.editedTranscript?.text ??
    (
      typeof reopened.rawTranscript.text === "string" &&
      reopened.rawTranscript.text.trim().length > 0
        ? reopened.rawTranscript.text.trim()
        : reopened.rawTranscript.segments
            .map(
              (segment) =>
                segment.text.trim(),
            )
            .filter(
              (segmentText) =>
                segmentText.length > 0,
            )
            .join("\n\n")
    );

  await writeFile(
    outputPath,
    text,
    {
      encoding: "utf8",
      flag: "w",
    },
  );

  return outputPath;
}
export async function renameSession(
  sessionDirectory: string,
  displayName: string,
): Promise<SessionMetadata> {
  const trimmedName =
    displayName.trim();

  if (!trimmedName) {
    throw new Error(
      "Namnet får inte vara tomt.",
    );
  }

  const reopened =
    await reopenSession(
      sessionDirectory,
    );

  const updatedMetadata: SessionMetadata = {
    ...reopened.metadata,
    displayName:
      trimmedName,
  };

  const metadataPath =
    join(
      sessionDirectory,
      "session.json",
    );

  const temporaryMetadataPath =
    join(
      sessionDirectory,
      "session.json.tmp",
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
