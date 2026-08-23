import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { getFfmpegPath } from "./runtime-paths.js";

let activeRecording:
  ChildProcess | null =
  null;

export interface RecordingResult {
  outputPath: string;
}

export async function startRecording(
  outputPath: string,
): Promise<void> {
  if (activeRecording) {
    throw new Error(
      "En inspelning pågår redan.",
    );
  }

  await mkdir(
    dirname(outputPath),
    {
      recursive: true,
    },
  );

  const ffmpegPath =
    getFfmpegPath();

  const child = spawn(
    ffmpegPath,
    [
      "-y",

      "-f",
      "dshow",
      "-i",
      "audio=Stereo Mix (Realtek(R) Audio)",

      "-f",
      "dshow",
      "-i",
      "audio=Microphone Array (Realtek(R) Audio)",

      "-filter_complex",
      "[0:a][1:a]amix=inputs=2:duration=longest:normalize=0[a]",

      "-map",
      "[a]",

      "-ar",
      "48000",

      "-ac",
      "1",

      outputPath,
    ],
    {
      stdio: [
        "pipe",
        "inherit",
        "inherit",
      ],
      shell: false,
    },
  );

  await new Promise<void>(
    (resolve, reject) => {
      child.once(
        "spawn",
        () => {
          activeRecording = child;
          resolve();
        },
      );

      child.once(
        "error",
        reject,
      );
    },
  );
}

export async function stopRecording():
Promise<void> {
  const child =
    activeRecording;

  if (!child) {
    throw new Error(
      "Ingen inspelning pågår.",
    );
  }

  activeRecording = null;

  await new Promise<void>(
    (resolve, reject) => {
      let settled = false;

      const finish = (
        error?: Error,
      ) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);

        if (error) {
          reject(error);
          return;
        }

        resolve();
      };

      child.once(
        "exit",
        (code) => {
          if (
            code === 0 ||
            code === 255
          ) {
            finish();
            return;
          }

          finish(
            new Error(
              `FFmpeg avslutades med kod ${code ?? "unknown"}.`,
            ),
          );
        },
      );

      child.once(
        "error",
        (error) => {
          finish(error);
        },
      );

      const timeout =
        setTimeout(
          () => {
            finish(
              new Error(
                "FFmpeg svarade inte när inspelningen skulle stoppas.",
              ),
            );
          },
          8000,
        );

      if (!child.stdin) {
        finish(
          new Error(
            "FFmpeg-processen saknar stdin och kan inte stoppas kontrollerat.",
          ),
        );
        return;
      }

      child.stdin.write(
        "q\n",
        (error) => {
          if (error) {
            finish(error);
            return;
          }

          child.stdin?.end();
        },
      );
    },
  );
}
export function isRecording(): boolean {
  return activeRecording !== null;
}
