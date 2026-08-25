import type {
  RawTranscript,
} from "./persistence.js";

export function rawTranscriptText(
  transcript: RawTranscript,
): string {
  if (
    typeof transcript.text === "string" &&
    transcript.text.trim().length > 0
  ) {
    return transcript.text.trim();
  }

  return transcript.segments
    .map((segment) => segment.text.trim())
    .filter((text) => text.length > 0)
    .join("\n\n");
}

export function rawTranscriptSegmentCount(
  transcript: RawTranscript,
): number {
  return transcript.segments.length;
}

export function rawTranscriptHasTimings(
  transcript: RawTranscript,
): boolean {
  if (transcript.asr.timingMode === "none") {
    return false;
  }

  return transcript.segments.length > 0;
}