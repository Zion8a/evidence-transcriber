# Local ASR Feasibility – 2026-08-15

## Goal

Verify whether Evidence Transcriber can perform useful local Swedish speech-to-text on the target Windows laptop before committing to the application architecture.

## Target environment

- Windows laptop
- AMD Ryzen 7 5825U
- 8 cores / 16 logical processors
- ~13.84 GiB physical memory reported by Windows
- Integrated AMD Radeon graphics
- whisper.cpp Windows x64 CPU build
- FFmpeg 9.0
- Local execution only

## Verified pipeline

M4A
→ FFmpeg
→ 16 kHz mono WAV
→ whisper.cpp
→ Swedish transcript
→ segment timestamps
→ JSON output

This pipeline was executed successfully on the target machine.

## Models evaluated

### Whisper base

- Model size: ~147 MB
- Swedish transcription technically successful
- Segment timestamps successful
- Performance was fast
- Quality was clearly insufficient on the initial Swedish material

Decision:

Not selected as a primary School Ready candidate.

### Whisper small

Model size: ~487 MB

Controlled tests:

| Test | Audio length | Elapsed | WER |
|---|---:|---:|---:|
| Standard Swedish read speech | 33.6 s | 22.18 s | 13.5% |
| Literary Swedish read speech | 35.7 s | 12.37 s | 16.7% |

Representative natural-speech test:

- Audio length: 133.0 s
- Elapsed: 43.33 s
- Approximate RTF: 0.33
- Approximate speed: 3.1× real time
- Transcript was usable but contained several obvious word and phrase distortions

Assessment:

Strong speed candidate, but requires noticeable human correction.

### Whisper medium

Model size: ~1.53 GB

Controlled tests:

| Test | Audio length | Elapsed | WER |
|---|---:|---:|---:|
| Standard Swedish read speech | 33.6 s | 48.47 s | 4.1% |
| Literary Swedish read speech | 35.7 s | 44.47 s | 9.1% |

Representative natural-speech test:

- Audio length: 133.0 s
- Elapsed: 129.41 s with 4 threads
- Approximate RTF: 0.97
- Approximate speed: approximately real time
- Transcript quality was substantially better than small

8-thread comparison on the same 133 s material:

- Elapsed with 4 threads: 129.41 s
- Elapsed with 8 threads: 128.53 s
- No meaningful wall-clock improvement
- Transcript output was unchanged

Assessment:

Current quality-leading School Ready candidate.

## Important limitations

The measured WER values are based on two short, manually verified Swedish recordings and must not be interpreted as general Swedish model accuracy.

The 133-second natural-speech material was evaluated qualitatively rather than against a complete human reference transcript.

Long lecture recordings have not yet been benchmarked.

CPU/RAM usage has not yet been measured systematically.

English has not yet been smoke-tested.

## Findings

1. Local Swedish ASR is technically feasible on the target hardware.
2. The originally identified risk that CPU-only transcription might be impractically slow did not materialize in these tests.
3. Whisper base is too inaccurate to remain a primary candidate.
4. Whisper small is fast and usable but produces significant correction work.
5. Whisper medium provides substantially better Swedish transcription and processes representative natural speech at approximately real-time speed.
6. Increasing from 4 to 8 threads did not materially improve medium wall-clock performance.
7. Segment timestamps and JSON output work.
8. M4A input can be normalized successfully through FFmpeg before ASR.

## Current decision

LOCAL ASR FEASIBILITY: PASS

Current model direction:

- `medium` = quality candidate
- `small` = speed candidate

No final School Ready model lock has yet been made.

No evidence currently requires abandoning local-first ASR, whisper.cpp, or the proposed FFmpeg-based media pipeline.

## Next risks

The largest remaining School Ready risks are no longer basic ASR feasibility.

They include:

- Windows system audio + microphone capture
- persistence and recovery
- raw vs edited transcript separation
- session reopening
- editing and export
- packaging and distribution
- handling longer real-world recordings
