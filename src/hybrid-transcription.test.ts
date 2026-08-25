import assert from "node:assert/strict";

import type {
  RawTranscript,
} from "./persistence.js";

import {
  rawTranscriptHasTimings,
  rawTranscriptSegmentCount,
  rawTranscriptText,
} from "./raw-transcript.js";

const local: RawTranscript = {
  schemaVersion: 1,
  sessionId: "local-test",
  source: {
    relativePath:
      "source\\local.wav",
  },
  asr: {
    engine: "whisper.cpp",
    provider: "local",
    model: "medium",
    language: "sv",
    timingMode: "segments",
  },
  segments: [
    {
      startMs: 0,
      endMs: 1000,
      text: "Första segmentet.",
    },
    {
      startMs: 1000,
      endMs: 2000,
      text: "Andra segmentet.",
    },
  ],
};

assert.equal(
  rawTranscriptText(local),
  "Första segmentet.\n\nAndra segmentet.",
);

assert.equal(
  rawTranscriptSegmentCount(local),
  2,
);

assert.equal(
  rawTranscriptHasTimings(local),
  true,
);

const cloud: RawTranscript = {
  schemaVersion: 1,
  sessionId: "cloud-test",
  source: {
    relativePath:
      "source\\cloud.wav",
  },
  asr: {
    engine:
      "openai-transcription-api",
    provider: "openai",
    model:
      "gpt-4o-mini-transcribe",
    language: "sv",
    timingMode: "none",
  },
  text:
    "Snabb cloud-transkribering.",
  segments: [],
};

assert.equal(
  rawTranscriptText(cloud),
  "Snabb cloud-transkribering.",
);

assert.equal(
  rawTranscriptSegmentCount(cloud),
  0,
);

assert.equal(
  rawTranscriptHasTimings(cloud),
  false,
);

const legacy: RawTranscript = {
  schemaVersion: 1,
  sessionId: "legacy-test",
  source: {
    relativePath:
      "source\\legacy.wav",
  },
  asr: {
    engine: "whisper.cpp",
    model: "medium",
    language: "sv",
  },
  segments: [
    {
      startMs: 0,
      endMs: 500,
      text:
        "Legacy session fungerar.",
    },
  ],
};

assert.equal(
  rawTranscriptText(legacy),
  "Legacy session fungerar.",
);

assert.equal(
  rawTranscriptHasTimings(legacy),
  true,
);

console.log(
  "PASS: hybrid raw transcript compatibility test",
);