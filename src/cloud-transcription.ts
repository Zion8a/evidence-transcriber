import {
  mkdir,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import {
  basename,
  join,
} from "node:path";
import {
  spawn,
} from "node:child_process";

import {
  createSession,
  persistRawTranscript,
  reopenSession,
  type RawTranscript,
  type ReopenedSession,
} from "./persistence.js";

import {
  getFfmpegPath,
  getSessionsRoot,
} from "./runtime-paths.js";

const OPENAI_TRANSCRIPTION_MODEL =
  "gpt-4o-mini-transcribe";

const CLOUD_CHUNK_SECONDS = 600;

function runCommand(
  command: string,
  args: string[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      command,
      args,
      {
        stdio: "inherit",
        shell: false,
      },
    );

    child.on("error", reject);

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}

interface OpenAiTranscriptionResponse {
  text?: string;
}

async function transcribeCloudChunk(
  chunkPath: string,
  language: string,
): Promise<string> {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Fast online kräver OPENAI_API_KEY. Ingen API-nyckel är tillgänglig.",
    );
  }

  const bytes =
    await readFile(chunkPath);

  const form =
    new FormData();

  form.append(
    "file",
    new Blob(
      [
        new Uint8Array(bytes),
      ],
      {
        type: "audio/mp4",
      },
    ),
    basename(chunkPath),
  );

  form.append(
    "model",
    OPENAI_TRANSCRIPTION_MODEL,
  );

  form.append(
    "language",
    language,
  );

  form.append(
    "response_format",
    "json",
  );

  const response =
    await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${apiKey}`,
        },
        body: form,
      },
    );

  const responseBody =
    await response.text();

  if (!response.ok) {
    let message =
      `OpenAI transcription failed with HTTP ${response.status}.`;

    try {
      const parsed =
        JSON.parse(responseBody) as {
          error?: {
            message?: string;
          };
        };

      if (parsed.error?.message) {
        message =
          `OpenAI transcription failed: ${parsed.error.message}`;
      }
    } catch {
      // Preserve status-only error message.
    }

    throw new Error(message);
  }

  let parsed:
    OpenAiTranscriptionResponse;

  try {
    parsed =
      JSON.parse(
        responseBody,
      ) as OpenAiTranscriptionResponse;
  } catch {
    throw new Error(
      "OpenAI transcription returned invalid JSON.",
    );
  }

  if (
    typeof parsed.text !== "string" ||
    parsed.text.trim().length === 0
  ) {
    return "";
  }

  return parsed.text.trim();
}

export interface CloudTranscriptionResult {
  sessionDirectory: string;
  reopened: ReopenedSession;
}

export async function transcribeImportedCloud(
  sourcePath: string,
  language = "sv",
): Promise<CloudTranscriptionResult> {
  const sessionsRoot =
    getSessionsRoot();

  const ffmpegPath =
    getFfmpegPath();

  const created =
    await createSession(
      sessionsRoot,
      sourcePath,
    );

  const preservedSourcePath =
    join(
      created.sessionDirectory,
      created.metadata.source.relativePath,
    );

  const workDirectory =
    join(
      created.sessionDirectory,
      "work",
    );

  await mkdir(
    workDirectory,
    {
      recursive: false,
    },
  );

  const chunkPattern =
    join(
      workDirectory,
      "cloud-chunk-%03d.m4a",
    );

  await runCommand(
    ffmpegPath,
    [
      "-y",
      "-i",
      preservedSourcePath,
      "-vn",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-f",
      "segment",
      "-segment_time",
      String(
        CLOUD_CHUNK_SECONDS,
      ),
      "-reset_timestamps",
      "1",
      chunkPattern,
    ],
  );

  const chunkFiles =
    (
      await readdir(
        workDirectory,
      )
    )
      .filter(
        (name) =>
          /^cloud-chunk-\d{3}\.m4a$/.test(
            name,
          ),
      )
      .sort();

  if (chunkFiles.length === 0) {
    throw new Error(
      "Fast online kunde inte skapa några ljuddelar.",
    );
  }

  const chunkTexts:
    string[] = [];

  try {
    for (
      const chunkFile
      of chunkFiles
    ) {
      const chunkPath =
        join(
          workDirectory,
          chunkFile,
        );

      const text =
        await transcribeCloudChunk(
          chunkPath,
          language,
        );

      chunkTexts.push(
        text,
      );
    }
  } finally {
    for (
      const chunkFile
      of chunkFiles
    ) {
      await rm(
        join(
          workDirectory,
          chunkFile,
        ),
        {
          force: true,
        },
      );
    }
  }

  const transcriptText =
    chunkTexts
      .map(
        (text) =>
          text.trim(),
      )
      .filter(
        (text) =>
          text.length > 0,
      )
      .join("\n\n");

  if (transcriptText.length === 0) {
    throw new Error(
      "Fast online gav inget transkript.",
    );
  }

  const transcript:
    RawTranscript = {
      schemaVersion: 1,
      sessionId:
        created.metadata.sessionId,
      source: {
        relativePath:
          created.metadata.source.relativePath,
      },
      asr: {
        engine:
          "openai-transcription-api",
        provider:
          "openai",
        model:
          OPENAI_TRANSCRIPTION_MODEL,
        language,
        timingMode:
          "none",
      },
      text:
        transcriptText,
      segments: [],
    };

  await persistRawTranscript(
    created.sessionDirectory,
    transcript,
  );

  const reopened =
    await reopenSession(
      created.sessionDirectory,
    );

  return {
    sessionDirectory:
      created.sessionDirectory,
    reopened,
  };
}