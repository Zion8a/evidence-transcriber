import { mkdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
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

const sourcePath = process.argv[2];

if (!sourcePath) {
  console.error(
    'Usage: npm run transcribe -- "C:\\path\\to\\file.m4a"',
  );
  process.exit(1);
}

if (sourcePath.toLowerCase().endsWith(".m4a") === false) {
  console.error(
    `Student Alpha currently supports M4A only: ${basename(sourcePath)}`,
  );
  process.exit(1);
}

const sessionsRoot = ".\\local-sessions";
const whisperCli =
  ".\\spike\\whisper.cpp\\build-static-release\\bin\\whisper-cli.exe";
const whisperModel =
  ".\\models\\ggml-medium.bin";

console.log(`Importing: ${sourcePath}`);

const created = await createSession(
  sessionsRoot,
  sourcePath,
);

console.log(`Session: ${created.metadata.sessionId}`);

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

console.log("Preprocessing audio...");

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

console.log("Transcribing locally with whisper.cpp medium...");

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

console.log("");
console.log("Transcription complete.");
console.log(`Session ID: ${reopened.metadata.sessionId}`);
console.log(`Source: ${reopened.metadata.source.originalName}`);
console.log(
  `Segments: ${reopened.rawTranscript.segments.length}`,
);
console.log(
  `Session directory: ${created.sessionDirectory}`,
);