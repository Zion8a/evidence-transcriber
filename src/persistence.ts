import {
  copyFile,
  mkdir,
  readFile,
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
    model: string;
    language: string;
  };
  segments: RawTranscriptSegment[];
}

export interface ReopenedSession {
  metadata: SessionMetadata;
  rawTranscript: RawTranscript;
}

export async function createSession(
  sessionsRoot: string,
  sourcePath: string,
): Promise<CreateSessionResult> {
  const sourceStats = await stat(sourcePath);

  if (!sourceStats.isFile()) {
    throw new Error(`Source path is not a file: ${sourcePath}`);
  }

  const sessionId = randomUUID();
  const sessionDirectory = join(sessionsRoot, sessionId);
  const sourceDirectory = join(sessionDirectory, "source");

  await mkdir(sessionsRoot, { recursive: true });
  await mkdir(sessionDirectory, { recursive: false });
  await mkdir(sourceDirectory, { recursive: false });

  const originalName = basename(sourcePath);
  const storedName = originalName;
  const preservedSourcePath = join(sourceDirectory, storedName);

  await copyFile(sourcePath, preservedSourcePath);

  const preservedStats = await stat(preservedSourcePath);

  if (preservedStats.size !== sourceStats.size) {
    throw new Error(
      `Preserved source size mismatch: expected ${sourceStats.size}, got ${preservedStats.size}`,
    );
  }

  const metadata: SessionMetadata = {
    schemaVersion: 1,
    sessionId,
    createdAt: new Date().toISOString(),
    source: {
      originalName,
      storedName,
      relativePath: relative(sessionDirectory, preservedSourcePath),
      sizeBytes: preservedStats.size,
    },
  };

  await writeFile(
    join(sessionDirectory, "session.json"),
    JSON.stringify(metadata, null, 2),
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
  const transcriptPath = join(sessionDirectory, "raw-transcript.json");

  await writeFile(
    transcriptPath,
    JSON.stringify(transcript, null, 2),
    {
      encoding: "utf8",
      flag: "wx",
    },
  );

  return transcriptPath;
}

export async function reopenSession(
  sessionDirectory: string,
): Promise<ReopenedSession> {
  const sessionJson = await readFile(
    join(sessionDirectory, "session.json"),
    "utf8",
  );

  const rawTranscriptJson = await readFile(
    join(sessionDirectory, "raw-transcript.json"),
    "utf8",
  );

  const metadata = JSON.parse(sessionJson) as SessionMetadata;
  const rawTranscript = JSON.parse(rawTranscriptJson) as RawTranscript;

  if (metadata.sessionId !== rawTranscript.sessionId) {
    throw new Error(
      `Session ID mismatch: metadata=${metadata.sessionId}, rawTranscript=${rawTranscript.sessionId}`,
    );
  }

  return {
    metadata,
    rawTranscript,
  };
}
