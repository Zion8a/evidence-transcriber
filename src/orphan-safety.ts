import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  readdir,
  readFile,
  rm,
} from "node:fs/promises";
import {
  basename,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import {
  reopenSession,
} from "./persistence.js";

function isFileNotFoundError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}

interface IncompleteSessionMetadata {
  sessionId: string;
  source: {
    relativePath: string;
    sizeBytes: number;
  };
}

function parseIncompleteSessionMetadata(
  json: string,
): IncompleteSessionMetadata {
  const parsed: unknown =
    JSON.parse(json);

  if (
    !isRecord(parsed) ||
    typeof parsed.sessionId !== "string" ||
    !isRecord(parsed.source) ||
    typeof parsed.source.relativePath !==
      "string" ||
    typeof parsed.source.sizeBytes !==
      "number" ||
    !Number.isSafeInteger(
      parsed.source.sizeBytes,
    ) ||
    parsed.source.sizeBytes < 0
  ) {
    throw new Error(
      "Incomplete session metadata is invalid.",
    );
  }

  return {
    sessionId:
      parsed.sessionId,
    source: {
      relativePath:
        parsed.source.relativePath,
      sizeBytes:
        parsed.source.sizeBytes,
    },
  };
}

function normalizeRelativePath(
  path: string,
): string {
  return path
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/");
}

function validateRelativePath(
  path: string,
  label: string,
): string {
  const normalized =
    normalizeRelativePath(path);

  if (
    normalized.length === 0 ||
    isAbsolute(path) ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.startsWith("/")
  ) {
    throw new Error(
      `${label} must be a relative path.`,
    );
  }

  const segments =
    normalized.split("/");

  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === "..",
    )
  ) {
    throw new Error(
      `${label} contains unsafe path segments.`,
    );
  }

  return normalized;
}

function resolveContainedPath(
  root: string,
  relativePath: string,
  label: string,
): {
  fullPath: string;
  normalizedRelativePath: string;
} {
  const normalizedRelativePath =
    validateRelativePath(
      relativePath,
      label,
    );

  const rootPath =
    resolve(root);

  const fullPath =
    resolve(
      rootPath,
      ...normalizedRelativePath.split("/"),
    );

  const containment =
    relative(
      rootPath,
      fullPath,
    );

  if (
    containment.length === 0 ||
    containment === ".." ||
    containment.startsWith(
      `..${sep}`,
    ) ||
    isAbsolute(containment)
  ) {
    throw new Error(
      `${label} escapes its session directory.`,
    );
  }

  return {
    fullPath,
    normalizedRelativePath,
  };
}

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

async function regularFileSize(
  path: string,
  label: string,
): Promise<number> {
  const stats =
    await lstat(path);

  if (!stats.isFile()) {
    throw new Error(
      `${label} is not a regular file.`,
    );
  }

  return stats.size;
}

async function assertPathMissing(
  path: string,
  label: string,
): Promise<void> {
  try {
    await lstat(path);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return;
    }

    throw error;
  }

  throw new Error(
    `${label} must not exist.`,
  );
}

async function assertNoRecordingReference(
  recordingsRoot: string,
  candidateSessionId: string,
): Promise<void> {
  const entries =
    await readdir(
      recordingsRoot,
      {
        withFileTypes: true,
      },
    );

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const recordingJsonPath =
      join(
        recordingsRoot,
        entry.name,
        "recording.json",
      );

    let recordingJson: string;

    try {
      recordingJson =
        await readFile(
          recordingJsonPath,
          "utf8",
        );
    } catch (error) {
      if (isFileNotFoundError(error)) {
        // No persisted recording metadata means
        // there is no persisted session reference
        // to inspect in this recording directory.
        continue;
      }

      throw error;
    }

    let parsed: unknown;

    try {
      parsed =
        JSON.parse(recordingJson);
    } catch {
      throw new Error(
        `Cannot prove orphan status because recording metadata is unreadable: ${entry.name}`,
      );
    }

    if (!isRecord(parsed)) {
      throw new Error(
        `Cannot prove orphan status because recording metadata is invalid: ${entry.name}`,
      );
    }

    const reference =
      parsed.transcriptionSessionId;

    if (
      reference !== undefined &&
      reference !== null &&
      typeof reference !== "string"
    ) {
      throw new Error(
        `Cannot prove orphan status because recording session reference is invalid: ${entry.name}`,
      );
    }

    if (
      typeof reference === "string" &&
      reference === candidateSessionId
    ) {
      throw new Error(
        "Candidate session is referenced by a recording.",
      );
    }
  }
}

interface ScannedTree {
  files: Array<{
    relativePath: string;
    fullPath: string;
  }>;
  directories: string[];
  specialEntries: string[];
}

async function scanTree(
  root: string,
  current: string = root,
): Promise<ScannedTree> {
  const result: ScannedTree = {
    files: [],
    directories: [],
    specialEntries: [],
  };

  const entries =
    await readdir(
      current,
      {
        withFileTypes: true,
      },
    );

  for (const entry of entries) {
    const fullPath =
      join(
        current,
        entry.name,
      );

    const relativePath =
      normalizeRelativePath(
        relative(
          root,
          fullPath,
        ),
      );

    if (entry.isDirectory()) {
      result.directories.push(
        relativePath,
      );

      const nested =
        await scanTree(
          root,
          fullPath,
        );

      result.files.push(
        ...nested.files,
      );

      result.directories.push(
        ...nested.directories,
      );

      result.specialEntries.push(
        ...nested.specialEntries,
      );

      continue;
    }

    if (entry.isFile()) {
      result.files.push({
        relativePath,
        fullPath,
      });

      continue;
    }

    // Symbolic links, junction-like entries,
    // devices, sockets etc. are not allowed in
    // a destructive historical cleanup candidate.
    result.specialEntries.push(
      relativePath,
    );
  }

  return result;
}

async function verifyCandidateTreeShape(
  sessionDirectory: string,
  sourceRelativePath: string,
): Promise<number> {
  if (
    !sourceRelativePath.startsWith(
      "source/",
    )
  ) {
    throw new Error(
      "Candidate source must be stored beneath source/.",
    );
  }

  const tree =
    await scanTree(
      sessionDirectory,
    );

  if (
    tree.specialEntries.length > 0
  ) {
    throw new Error(
      "Candidate session contains unsupported filesystem entries.",
    );
  }

  const sourceParts =
    sourceRelativePath.split("/");

  const allowedSourceDirectories =
    new Set<string>();

  for (
    let index = 1;
    index < sourceParts.length;
    index += 1
  ) {
    allowedSourceDirectories.add(
      sourceParts
        .slice(
          0,
          index,
        )
        .join("/"),
    );
  }

  const unexpectedFiles =
    tree.files.filter(
      (file) =>
        file.relativePath !==
          "session.json" &&
        file.relativePath !==
          sourceRelativePath &&
        !file.relativePath.startsWith(
          "work/",
        ),
    );

  if (
    unexpectedFiles.length > 0
  ) {
    throw new Error(
      `Candidate session contains unexpected file: ${unexpectedFiles[0]?.relativePath ?? "unknown"}`,
    );
  }

  const unexpectedDirectories =
    tree.directories.filter(
      (directory) =>
        !allowedSourceDirectories.has(
          directory,
        ) &&
        directory !== "work" &&
        !directory.startsWith(
          "work/",
        ),
    );

  if (
    unexpectedDirectories.length > 0
  ) {
    throw new Error(
      `Candidate session contains unexpected directory: ${unexpectedDirectories[0] ?? "unknown"}`,
    );
  }

  let totalBytes = 0;

  for (const file of tree.files) {
    totalBytes +=
      await regularFileSize(
        file.fullPath,
        "Candidate tree file",
      );
  }

  return totalBytes;
}

export interface DuplicateOrphanVerification {
  sessionId: string;
  canonicalSessionId: string;
  sourceBytes: number;
  totalCandidateBytes: number;
  sha256: string;
}

export interface DuplicateOrphanCleanupRequest {
  sessionDirectory: string;
  canonicalSessionDirectory: string;
  recordingsRoot: string;
  expectedCanonicalSha256: string;
}

export async function verifyDuplicateOrphanSession(
  request: DuplicateOrphanCleanupRequest,
): Promise<DuplicateOrphanVerification> {
  const candidateDirectory =
    resolve(
      request.sessionDirectory,
    );

  const canonicalDirectory =
    resolve(
      request.canonicalSessionDirectory,
    );

  if (
    candidateDirectory ===
    canonicalDirectory
  ) {
    throw new Error(
      "Candidate session cannot be the canonical session.",
    );
  }

  const expectedSha256 =
    request.expectedCanonicalSha256
      .toLowerCase();

  if (
    !/^[0-9a-f]{64}$/.test(
      expectedSha256,
    )
  ) {
    throw new Error(
      "Expected canonical SHA-256 is invalid.",
    );
  }

  const candidateMetadataPath =
    join(
      candidateDirectory,
      "session.json",
    );

  await regularFileSize(
    candidateMetadataPath,
    "Candidate session.json",
  );

  const candidateMetadata =
    parseIncompleteSessionMetadata(
      await readFile(
        candidateMetadataPath,
        "utf8",
      ),
    );

  if (
    basename(candidateDirectory) !==
    candidateMetadata.sessionId
  ) {
    throw new Error(
      "Candidate session directory identity mismatch.",
    );
  }

  await assertPathMissing(
    join(
      candidateDirectory,
      "raw-transcript.json",
    ),
    "Candidate raw transcript",
  );

  await assertPathMissing(
    join(
      candidateDirectory,
      "edited-transcript.json",
    ),
    "Candidate edited transcript",
  );

  await assertNoRecordingReference(
    request.recordingsRoot,
    candidateMetadata.sessionId,
  );

  const candidateSource =
    resolveContainedPath(
      candidateDirectory,
      candidateMetadata.source.relativePath,
      "Candidate source path",
    );

  const totalCandidateBytes =
    await verifyCandidateTreeShape(
      candidateDirectory,
      candidateSource.normalizedRelativePath,
    );

  const candidateSourceBytes =
    await regularFileSize(
      candidateSource.fullPath,
      "Candidate source",
    );

  if (
    candidateSourceBytes !==
    candidateMetadata.source.sizeBytes
  ) {
    throw new Error(
      "Candidate source size does not match session metadata.",
    );
  }

  const canonical =
    await reopenSession(
      canonicalDirectory,
    );

  if (
    basename(canonicalDirectory) !==
    canonical.metadata.sessionId
  ) {
    throw new Error(
      "Canonical session directory identity mismatch.",
    );
  }

  const canonicalSource =
    resolveContainedPath(
      canonicalDirectory,
      canonical.metadata.source.relativePath,
      "Canonical source path",
    );

  const canonicalSourceBytes =
    await regularFileSize(
      canonicalSource.fullPath,
      "Canonical source",
    );

  if (
    canonicalSourceBytes !==
    canonical.metadata.source.sizeBytes
  ) {
    throw new Error(
      "Canonical source size does not match session metadata.",
    );
  }

  if (
    canonicalSourceBytes !==
    candidateSourceBytes
  ) {
    throw new Error(
      "Candidate and canonical source sizes differ.",
    );
  }

  const canonicalSha256 =
    await sha256File(
      canonicalSource.fullPath,
    );

  if (
    canonicalSha256 !==
    expectedSha256
  ) {
    throw new Error(
      "Canonical source no longer matches expected SHA-256.",
    );
  }

  const candidateSha256 =
    await sha256File(
      candidateSource.fullPath,
    );

  if (
    candidateSha256 !==
    canonicalSha256
  ) {
    throw new Error(
      "Candidate source is not SHA-256-identical to canonical source.",
    );
  }

  return {
    sessionId:
      candidateMetadata.sessionId,
    canonicalSessionId:
      canonical.metadata.sessionId,
    sourceBytes:
      candidateSourceBytes,
    totalCandidateBytes,
    sha256:
      candidateSha256,
  };
}

export async function removeVerifiedDuplicateOrphanSession(
  request: DuplicateOrphanCleanupRequest,
): Promise<DuplicateOrphanVerification> {
  // The destructive function does not accept a
  // precomputed "approved" boolean or stale proof.
  // It performs the complete verification itself
  // immediately before deleting the candidate.
  const verified =
    await verifyDuplicateOrphanSession(
      request,
    );

  await rm(
    request.sessionDirectory,
    {
      recursive: true,
      force: false,
    },
  );

  try {
    await lstat(
      request.sessionDirectory,
    );
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return verified;
    }

    throw error;
  }

  throw new Error(
    "Verified orphan session still exists after cleanup.",
  );
}