# System Audio + Microphone Capture Feasibility

**Date:** 2026-08-16
**Project:** Evidence Transcriber
**Target:** School Ready / Student Alpha – 2026-08-24
**Environment:** Windows target laptop

## Result

**CAPTURE FEASIBILITY: PASS**

The target Windows machine can locally capture:

* Windows system audio,
* microphone audio,
* system audio and microphone simultaneously,

and pass the combined recording through the existing local Evidence Transcriber ASR pipeline.

Verified pipeline:

```text
Windows system audio (Stereo Mix)
+
Microphone Array
→ FFmpeg DirectShow capture
→ FFmpeg amix
→ WAV
→ FFmpeg 16 kHz mono conversion
→ whisper.cpp
→ Swedish transcript
→ segment timestamps
→ JSON
```

This removes the primary feasibility uncertainty around combined Windows system-audio and microphone capture for the School Ready scope.

## Environment and devices

FFmpeg device inspection showed that the installed build supports:

```text
dshow – DirectShow capture
```

No WASAPI input device was exposed by the current FFmpeg build.

Initial DirectShow enumeration exposed:

* Integrated Camera
* Microphone Array (Realtek(R) Audio)

Windows sound settings also contained:

* Stereo Mix (Realtek(R) Audio)

Stereo Mix was initially disabled.

After enabling Stereo Mix in Windows, FFmpeg DirectShow enumeration exposed both:

```text
Microphone Array (Realtek(R) Audio)
Stereo Mix (Realtek(R) Audio)
```

No driver installation or additional capture software was required.

## System-audio capture

System audio was captured from:

```text
Stereo Mix (Realtek(R) Audio)
```

using FFmpeg DirectShow.

A 10-second WAV recording was successfully created.

Observed format:

* PCM 16-bit
* 44.1 kHz
* stereo

Signal verification with FFmpeg `volumedetect` gave:

```text
mean_volume: -28.3 dB
max_volume: -9.3 dB
```

Human listening verification confirmed that the file contained the intended Windows playback audio.

**System audio capture: PASS**

## Microphone capture

Microphone audio was captured from:

```text
Microphone Array (Realtek(R) Audio)
```

A 10-second WAV recording was successfully created.

Observed format:

* PCM 16-bit
* 44.1 kHz
* stereo

Signal verification gave:

```text
mean_volume: -30.7 dB
max_volume: -11.9 dB
```

Human listening verification confirmed that the recording contained clear and understandable microphone speech.

**Microphone capture: PASS**

## Simultaneous system audio + microphone

Both DirectShow devices were opened simultaneously:

```text
Stereo Mix (Realtek(R) Audio)
Microphone Array (Realtek(R) Audio)
```

FFmpeg combined the streams with `amix` and created:

```text
combined-audio-test.wav
```

The resulting recording was approximately 10 seconds long.

Human listening verification confirmed that:

* Windows system audio was present,
* microphone speech was present.

**Simultaneous capture: PASS**

### Timing observation

FFmpeg reported different source start timestamps during the simultaneous test, with approximately 0.9 seconds difference between the two input streams.

This short spike does not establish whether that difference creates a practical synchronization issue during longer recordings.

Synchronization should therefore remain a known item for later controlled recording tests.

It is not considered a blocker for capture feasibility.

## ASR pipeline verification

The combined recording was converted with FFmpeg to:

```text
16 kHz
mono
PCM WAV
```

The resulting file was successfully processed by local `whisper.cpp` using the multilingual Whisper `medium` model.

Environment reported:

```text
model: medium
model size: ~1533 MB
backend: CPU
threads: 8 / 16
GPU: not found
language: sv
timestamps: enabled
```

The input contained approximately:

```text
9.9 seconds
157808 samples
```

whisper.cpp produced Swedish text with segment timestamps and saved JSON output successfully.

Example output:

```text
[00:00:00.000 --> 00:00:04.480] "Fins de som upplever att du är en nejsägare?"
[00:00:04.480 --> 00:00:06.480] "Nej!"
[00:00:06.480 --> 00:00:09.480] "Och sen flyger dörren upp och där står jag!"
```

Output was saved as:

```text
combined-audio-test-transcript.json
```

Reported total whisper execution time was approximately:

```text
14.65 seconds
```

including approximately:

```text
4.47 seconds model load time
```

Because the sample is only about 10 seconds long, this result should not be used as a meaningful throughput benchmark against the longer ASR feasibility tests.

**Combined capture → local ASR: PASS**

## Quality observations

The purpose of this spike was capture feasibility, not transcription-quality benchmarking.

The mixed WAV was manually verified to contain both system audio and microphone audio.

However, the resulting raw transcript does not independently demonstrate that all speech from both sources was transcribed correctly.

This remains important for later controlled tests involving:

* system speech only,
* microphone speech only,
* alternating speakers,
* overlapping speech,
* different source levels,
* longer recording duration,
* synchronization.

The raw output also contained an apparent transcription error:

```text
"Fins de ..."
```

This reinforces the existing Evidence Transcriber principle:

```text
source/original
→ raw transcript
→ edited transcript
→ AI interpretation
```

Raw ASR output must not be treated as verified source truth.

## What is now verified

On the actual target machine:

* FFmpeg can access the microphone through DirectShow.
* Windows exposes Stereo Mix after it is enabled.
* FFmpeg can access Stereo Mix through DirectShow.
* Stereo Mix captures actual Windows playback audio.
* Microphone capture produces usable speech audio.
* Both devices can be opened simultaneously.
* FFmpeg can mix both inputs into one local WAV.
* The mixed recording can be converted to 16 kHz mono.
* The mixed recording can be processed by local whisper.cpp.
* Swedish transcript output is produced.
* Segment timestamps are produced.
* JSON output is produced.

## What is not yet verified

This spike does **not** establish that:

* long recordings remain synchronized,
* source levels are automatically balanced,
* overlapping speakers are transcribed reliably,
* every Windows machine exposes Stereo Mix,
* Stereo Mix will always be enabled,
* device names are portable across machines,
* recording recovery after interruption works,
* the production application can start/stop capture reliably,
* the application can package this functionality for distribution,
* raw transcripts from mixed audio are sufficiently accurate without human review.

These remain implementation or verification concerns rather than reasons to reject the current technical direction.

## Decision

**SYSTEM AUDIO + MICROPHONE CAPTURE FEASIBILITY: PASS**

No architecture pivot is required.

Current School Ready direction remains viable:

```text
local capture/import
→ FFmpeg media pipeline
→ local whisper.cpp ASR
→ timestamped raw transcript
→ persistent evidence layers
```

The project should now stop additional capture-feasibility experimentation and move toward the first minimal production vertical slice.

No evidence from this spike currently justifies:

* cloud recording infrastructure,
* an additional audio-capture runtime,
* real-time transcription,
* diarization,
* a general audio abstraction framework,
* or expansion of the School Ready scope.
