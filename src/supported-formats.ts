import { extname } from "node:path";

export const supportedInputExtensions = [
  ".m4a",
  ".mp3",
  ".wav",
  ".mp4",
] as const;

export function isSupportedInputFile(
  fileName: string,
): boolean {
  const extension =
    extname(fileName).toLowerCase();

  return supportedInputExtensions.includes(
    extension as typeof supportedInputExtensions[number],
  );
}

export function supportedInputLabel(): string {
  return "M4A, MP3, WAV or MP4";
}
