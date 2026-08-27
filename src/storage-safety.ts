import {
  rm,
  stat,
} from "node:fs/promises";
import { join } from "node:path";

function isFileNotFoundError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export async function removeIncompleteSession(
  sessionDirectory: string,
): Promise<boolean> {
  const rawTranscriptPath =
    join(
      sessionDirectory,
      "raw-transcript.json",
    );

  try {
    await stat(
      rawTranscriptPath,
    );

    // Conservative rule:
    // if raw-transcript.json exists at all,
    // this helper must not delete the session.
    return false;
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }

  await rm(
    sessionDirectory,
    {
      recursive: true,
      force: true,
    },
  );

  return true;
}

export async function removeSessionWorkDirectory(
  sessionDirectory: string,
): Promise<void> {
  await rm(
    join(
      sessionDirectory,
      "work",
    ),
    {
      recursive: true,
      force: true,
    },
  );
}
