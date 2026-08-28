import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

import {
  removeIncompleteSession,
  removeSessionWorkDirectory,
} from "./storage-safety.js";

import {
  removeVerifiedDuplicateOrphanSession,
  verifyDuplicateOrphanSession,
} from "./orphan-safety.js";

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

function sha256Buffer(
  value: Buffer,
): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

interface SessionFixtureOptions {
  raw?: boolean;
  edited?: boolean;
  work?: boolean;
  unexpectedFile?: boolean;
}

async function writeSessionFixture(
  sessionsRoot: string,
  sessionId: string,
  source: Buffer,
  options: SessionFixtureOptions = {},
): Promise<{
  directory: string;
  sourcePath: string;
  rawPath: string;
}> {
  const directory =
    join(
      sessionsRoot,
      sessionId,
    );

  const sourceDirectory =
    join(
      directory,
      "source",
    );

  const sourcePath =
    join(
      sourceDirectory,
      "recording.wav",
    );

  const rawPath =
    join(
      directory,
      "raw-transcript.json",
    );

  await mkdir(
    sourceDirectory,
    {
      recursive: true,
    },
  );

  await writeFile(
    sourcePath,
    source,
  );

  await writeFile(
    join(
      directory,
      "session.json",
    ),
    JSON.stringify(
      {
        schemaVersion: 1,
        sessionId,
        createdAt:
          "2026-08-28T00:00:00.000Z",
        source: {
          originalName:
            "recording.wav",
          storedName:
            "recording.wav",
          relativePath:
            join(
              "source",
              "recording.wav",
            ),
          sizeBytes:
            source.length,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  if (options.raw) {
    await writeFile(
      rawPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          sessionId,
          source: {
            relativePath:
              join(
                "source",
                "recording.wav",
              ),
          },
          asr: {
            engine:
              "test",
            model:
              "test",
            language:
              "sv",
            timingMode:
              "segments",
          },
          segments: [],
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  if (options.edited) {
    await writeFile(
      join(
        directory,
        "edited-transcript.json",
      ),
      JSON.stringify(
        {
          schemaVersion: 1,
          sessionId,
          source: {
            relativePath:
              join(
                "source",
                "recording.wav",
              ),
          },
          basedOnRawTranscript: {
            relativePath:
              "raw-transcript.json",
          },
          updatedAt:
            "2026-08-28T00:00:00.000Z",
          text:
            "edited",
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  if (options.work) {
    const workDirectory =
      join(
        directory,
        "work",
      );

    await mkdir(
      workDirectory,
      {
        recursive: true,
      },
    );

    await writeFile(
      join(
        workDirectory,
        "preprocessed.wav",
      ),
      Buffer.from(
        "derived-work",
      ),
    );
  }

  if (options.unexpectedFile) {
    await writeFile(
      join(
        directory,
        "unexpected.txt",
      ),
      "must block cleanup",
      "utf8",
    );
  }

  return {
    directory,
    sourcePath,
    rawPath,
  };
}

async function makeOrphanEnvironment(
  testRoot: string,
  label: string,
  candidateSource: Buffer,
  canonicalSource: Buffer = candidateSource,
  candidateOptions: SessionFixtureOptions = {},
): Promise<{
  sessionsRoot: string;
  recordingsRoot: string;
  candidate: Awaited<
    ReturnType<typeof writeSessionFixture>
  >;
  canonical: Awaited<
    ReturnType<typeof writeSessionFixture>
  >;
  expectedSha256: string;
}> {
  const root =
    join(
      testRoot,
      label,
    );

  const sessionsRoot =
    join(
      root,
      "sessions",
    );

  const recordingsRoot =
    join(
      root,
      "recordings",
    );

  await mkdir(
    sessionsRoot,
    {
      recursive: true,
    },
  );

  await mkdir(
    recordingsRoot,
    {
      recursive: true,
    },
  );

  const canonical =
    await writeSessionFixture(
      sessionsRoot,
      `${label}-canonical`,
      canonicalSource,
      {
        raw: true,
      },
    );

  const candidate =
    await writeSessionFixture(
      sessionsRoot,
      `${label}-candidate`,
      candidateSource,
      candidateOptions,
    );

  return {
    sessionsRoot,
    recordingsRoot,
    candidate,
    canonical,
    expectedSha256:
      sha256Buffer(
        canonicalSource,
      ),
  };
}

const testRoot =
  await mkdtemp(
    join(
      tmpdir(),
      "evidence-transcriber-storage-safety-",
    ),
  );

try {
  // ==========================================================
  // EXISTING STORAGE-SAFETY REGRESSIONS
  // ==========================================================

  const incompleteSession =
    join(
      testRoot,
      "incomplete-session",
    );

  const incompleteSourceDirectory =
    join(
      incompleteSession,
      "source",
    );

  await mkdir(
    incompleteSourceDirectory,
    {
      recursive: true,
    },
  );

  await writeFile(
    join(
      incompleteSourceDirectory,
      "recording.wav",
    ),
    Buffer.from(
      "incomplete-source",
    ),
  );

  const incompleteRemoved =
    await removeIncompleteSession(
      incompleteSession,
    );

  assert.equal(
    incompleteRemoved,
    true,
    "Session without raw transcript should be removed",
  );

  assert.equal(
    await exists(
      incompleteSession,
    ),
    false,
    "Incomplete session directory should no longer exist",
  );

  const completeSession =
    join(
      testRoot,
      "complete-session",
    );

  const completeSourceDirectory =
    join(
      completeSession,
      "source",
    );

  await mkdir(
    completeSourceDirectory,
    {
      recursive: true,
    },
  );

  const completeSourcePath =
    join(
      completeSourceDirectory,
      "recording.wav",
    );

  const rawTranscriptPath =
    join(
      completeSession,
      "raw-transcript.json",
    );

  await writeFile(
    completeSourcePath,
    Buffer.from(
      "preserved-source",
    ),
  );

  await writeFile(
    rawTranscriptPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        text:
          "raw transcript",
      },
      null,
      2,
    ),
    "utf8",
  );

  const completeRemoved =
    await removeIncompleteSession(
      completeSession,
    );

  assert.equal(
    completeRemoved,
    false,
    "Session with raw transcript must not be removed",
  );

  assert.equal(
    await exists(
      completeSourcePath,
    ),
    true,
    "Protected session source must remain",
  );

  assert.equal(
    await exists(
      rawTranscriptPath,
    ),
    true,
    "Protected raw transcript must remain",
  );

  const workDirectory =
    join(
      completeSession,
      "work",
    );

  await mkdir(
    workDirectory,
    {
      recursive: true,
    },
  );

  await writeFile(
    join(
      workDirectory,
      "preprocessed.wav",
    ),
    Buffer.from(
      "derived-audio",
    ),
  );

  await writeFile(
    join(
      workDirectory,
      "whisper-output.json",
    ),
    "{}",
    "utf8",
  );

  const sourceBefore =
    await readFile(
      completeSourcePath,
    );

  const rawBefore =
    await readFile(
      rawTranscriptPath,
    );

  await removeSessionWorkDirectory(
    completeSession,
  );

  assert.equal(
    await exists(
      workDirectory,
    ),
    false,
    "Work directory should be removed",
  );

  assert.deepEqual(
    await readFile(
      completeSourcePath,
    ),
    sourceBefore,
    "Work cleanup must not modify preserved source",
  );

  assert.deepEqual(
    await readFile(
      rawTranscriptPath,
    ),
    rawBefore,
    "Work cleanup must not modify raw transcript",
  );

  // ==========================================================
  // STRICT DUPLICATE-ORPHAN REGRESSIONS
  // ==========================================================

  const valid =
    await makeOrphanEnvironment(
      testRoot,
      "valid",
      Buffer.from(
        "same-canonical-source",
      ),
      undefined,
      {
        work: true,
      },
    );

  const validProof =
    await verifyDuplicateOrphanSession(
      {
        sessionDirectory:
          valid.candidate.directory,
        canonicalSessionDirectory:
          valid.canonical.directory,
        recordingsRoot:
          valid.recordingsRoot,
        expectedCanonicalSha256:
          valid.expectedSha256,
      },
    );

  assert.equal(
    validProof.sessionId,
    "valid-candidate",
    "Valid orphan should verify",
  );

  assert.equal(
    validProof.canonicalSessionId,
    "valid-canonical",
    "Canonical identity should be preserved",
  );

  const canonicalBeforeCleanup =
    await readFile(
      valid.canonical.sourcePath,
    );

  const canonicalRawBeforeCleanup =
    await readFile(
      valid.canonical.rawPath,
    );

  const removedProof =
    await removeVerifiedDuplicateOrphanSession(
      {
        sessionDirectory:
          valid.candidate.directory,
        canonicalSessionDirectory:
          valid.canonical.directory,
        recordingsRoot:
          valid.recordingsRoot,
        expectedCanonicalSha256:
          valid.expectedSha256,
      },
    );

  assert.equal(
    removedProof.sha256,
    valid.expectedSha256,
    "Removed orphan proof should retain SHA",
  );

  assert.equal(
    await exists(
      valid.candidate.directory,
    ),
    false,
    "Verified orphan candidate should be removed",
  );

  assert.deepEqual(
    await readFile(
      valid.canonical.sourcePath,
    ),
    canonicalBeforeCleanup,
    "Canonical source must remain byte-identical",
  );

  assert.deepEqual(
    await readFile(
      valid.canonical.rawPath,
    ),
    canonicalRawBeforeCleanup,
    "Canonical raw transcript must remain byte-identical",
  );

  const referenced =
    await makeOrphanEnvironment(
      testRoot,
      "referenced",
      Buffer.from(
        "referenced-source",
      ),
    );

  const referencedRecordingDirectory =
    join(
      referenced.recordingsRoot,
      "recording-1",
    );

  await mkdir(
    referencedRecordingDirectory,
    {
      recursive: true,
    },
  );

  await writeFile(
    join(
      referencedRecordingDirectory,
      "recording.json",
    ),
    JSON.stringify(
      {
        recordingId:
          "recording-1",
        transcriptionSessionId:
          "referenced-candidate",
      },
      null,
      2,
    ),
    "utf8",
  );

  await assert.rejects(
    removeVerifiedDuplicateOrphanSession(
      {
        sessionDirectory:
          referenced.candidate.directory,
        canonicalSessionDirectory:
          referenced.canonical.directory,
        recordingsRoot:
          referenced.recordingsRoot,
        expectedCanonicalSha256:
          referenced.expectedSha256,
      },
    ),
    /referenced by a recording/,
    "Referenced session must never be deleted",
  );

  assert.equal(
    await exists(
      referenced.candidate.directory,
    ),
    true,
    "Referenced candidate must remain",
  );

  const withRaw =
    await makeOrphanEnvironment(
      testRoot,
      "with-raw",
      Buffer.from(
        "raw-protected-source",
      ),
      undefined,
      {
        raw: true,
      },
    );

  await assert.rejects(
    removeVerifiedDuplicateOrphanSession(
      {
        sessionDirectory:
          withRaw.candidate.directory,
        canonicalSessionDirectory:
          withRaw.canonical.directory,
        recordingsRoot:
          withRaw.recordingsRoot,
        expectedCanonicalSha256:
          withRaw.expectedSha256,
      },
    ),
    /raw transcript.*must not exist/i,
    "Candidate with raw transcript must be protected",
  );

  assert.equal(
    await exists(
      withRaw.candidate.directory,
    ),
    true,
    "Raw-bearing candidate must remain",
  );

  const withEdited =
    await makeOrphanEnvironment(
      testRoot,
      "with-edited",
      Buffer.from(
        "edited-protected",
      ),
      undefined,
      {
        edited: true,
      },
    );

  await assert.rejects(
    removeVerifiedDuplicateOrphanSession(
      {
        sessionDirectory:
          withEdited.candidate.directory,
        canonicalSessionDirectory:
          withEdited.canonical.directory,
        recordingsRoot:
          withEdited.recordingsRoot,
        expectedCanonicalSha256:
          withEdited.expectedSha256,
      },
    ),
    /edited transcript.*must not exist/i,
    "Candidate with edited transcript must be protected",
  );

  assert.equal(
    await exists(
      withEdited.candidate.directory,
    ),
    true,
    "Edited-bearing candidate must remain",
  );

  const mismatched =
    await makeOrphanEnvironment(
      testRoot,
      "mismatched",
      Buffer.from(
        "AAAA",
      ),
      Buffer.from(
        "BBBB",
      ),
    );

  await assert.rejects(
    removeVerifiedDuplicateOrphanSession(
      {
        sessionDirectory:
          mismatched.candidate.directory,
        canonicalSessionDirectory:
          mismatched.canonical.directory,
        recordingsRoot:
          mismatched.recordingsRoot,
        expectedCanonicalSha256:
          mismatched.expectedSha256,
      },
    ),
    /not SHA-256-identical/,
    "Different content with same size must be rejected",
  );

  assert.equal(
    await exists(
      mismatched.candidate.directory,
    ),
    true,
    "SHA-mismatched candidate must remain",
  );

  const unexpected =
    await makeOrphanEnvironment(
      testRoot,
      "unexpected",
      Buffer.from(
        "unexpected-file-source",
      ),
      undefined,
      {
        unexpectedFile: true,
      },
    );

  await assert.rejects(
    removeVerifiedDuplicateOrphanSession(
      {
        sessionDirectory:
          unexpected.candidate.directory,
        canonicalSessionDirectory:
          unexpected.canonical.directory,
        recordingsRoot:
          unexpected.recordingsRoot,
        expectedCanonicalSha256:
          unexpected.expectedSha256,
      },
    ),
    /unexpected file/,
    "Unexpected evidence must block cleanup",
  );

  assert.equal(
    await exists(
      unexpected.candidate.directory,
    ),
    true,
    "Candidate with unexpected file must remain",
  );

  const unreadableRecording =
    await makeOrphanEnvironment(
      testRoot,
      "unreadable-recording",
      Buffer.from(
        "fail-closed-source",
      ),
    );

  const brokenRecordingDirectory =
    join(
      unreadableRecording.recordingsRoot,
      "broken-recording",
    );

  await mkdir(
    brokenRecordingDirectory,
    {
      recursive: true,
    },
  );

  await writeFile(
    join(
      brokenRecordingDirectory,
      "recording.json",
    ),
    "{this is not valid json",
    "utf8",
  );

  await assert.rejects(
    removeVerifiedDuplicateOrphanSession(
      {
        sessionDirectory:
          unreadableRecording.candidate.directory,
        canonicalSessionDirectory:
          unreadableRecording.canonical.directory,
        recordingsRoot:
          unreadableRecording.recordingsRoot,
        expectedCanonicalSha256:
          unreadableRecording.expectedSha256,
      },
    ),
    /Cannot prove orphan status/,
    "Unreadable recording metadata must fail closed",
  );

  assert.equal(
    await exists(
      unreadableRecording.candidate.directory,
    ),
    true,
    "Candidate must remain when references cannot be proven",
  );

  const wrongExpectedHash =
    await makeOrphanEnvironment(
      testRoot,
      "wrong-hash",
      Buffer.from(
        "expected-hash-anchor",
      ),
    );

  await assert.rejects(
    removeVerifiedDuplicateOrphanSession(
      {
        sessionDirectory:
          wrongExpectedHash.candidate.directory,
        canonicalSessionDirectory:
          wrongExpectedHash.canonical.directory,
        recordingsRoot:
          wrongExpectedHash.recordingsRoot,
        expectedCanonicalSha256:
          "0".repeat(64),
      },
    ),
    /Canonical source no longer matches expected SHA-256/,
    "Cleanup must be anchored to expected canonical SHA",
  );

  assert.equal(
    await exists(
      wrongExpectedHash.candidate.directory,
    ),
    true,
    "Candidate must remain when canonical proof changed",
  );

  console.log(
    "PASS: storage safety regression test",
  );

  console.log(
    "PASS: strict duplicate-orphan cleanup regression test",
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