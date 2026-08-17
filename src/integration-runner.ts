import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  createSession,
  persistRawTranscript,
  reopenSession,
  type RawTranscript,
} from "./persistence.js";

function runCommand(
  command: string,
  args: string[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
    });

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

const sessionsRoot = ".\\local-sessions-test";
const sourcePath = ".\\testdata\\svenska-test-02-standard.m4a";
const whisperCli =
  ".\\spike\\whisper.cpp\\build-static-release\\bin\\whisper-cli.exe";
const whisperModel =
  ".\\models\\ggml-medium.bin";

const created = await createSession(
  sessionsRoot,
  sourcePath,
);

const preservedSourcePath = join(
  created.sessionDirectory,
  created.metadata.source.relativePath,
);

const workDirectory = join(
  created.sessionDirectory,
  "work",
);

await mkdir(workDirectory, {
  recursive: false,
});

const wavPath = join(
  workDirectory,
  "preprocessed.wav",
);

await runCommand("ffmpeg", [
  "-y",
  "-i",
  preservedSourcePath,
  "-ar",
  "16000",
  "-ac",
  "1",
  wavPath,
]);

const whisperOutputBase = join(
  workDirectory,
  "whisper-output",
);

await runCommand(whisperCli, [
  "-m",
  whisperModel,
  "-f",
  wavPath,
  "-l",
  "sv",
  "-oj",
  "-of",
  whisperOutputBase,
]);

const whisperJsonPath =
  `${whisperOutputBase}.json`;

const whisperJson = JSON.parse(
  await readFile(
    whisperJsonPath,
    "utf8",
  ),
);

const transcript: RawTranscript = {
  schemaVersion: 1,
  sessionId: created.metadata.sessionId,
  source: {
    relativePath:
      created.metadata.source.relativePath,
  },
  asr: {
    engine: "whisper.cpp",
    model: "medium",
    language: whisperJson.result.language,
  },
  segments: whisperJson.transcription.map(
    (segment: {
      offsets: {
        from: number;
        to: number;
      };
      text: string;
    }) => ({
      startMs: segment.offsets.from,
      endMs: segment.offsets.to,
      text: segment.text,
    }),
  ),
};

await persistRawTranscript(
  created.sessionDirectory,
  transcript,
);

const reopened = await reopenSession(
  created.sessionDirectory,
);

console.log(
  JSON.stringify(
    {
      sessionDirectory:
        created.sessionDirectory,
      sessionId:
        reopened.metadata.sessionId,
      source:
        reopened.metadata.source,
      segmentCount:
        reopened.rawTranscript.segments.length,
      firstSegment:
        reopened.rawTranscript.segments[0],
    },
    null,
    2,
  ),
);