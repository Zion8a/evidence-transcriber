# Persistence Contract – Student Alpha

## Scope

This contract applies to the Persistent Import → Transcript → Reopen vertical slice.

The goal is to persist the minimum evidence chain required for:

source/original → raw transcript

Edited transcript and AI interpretation are outside this slice.

## Session structure

Each session is stored in its own directory:

sessions/
  <session-id>/
    session.json
    source/
      <original-filename>
    raw-transcript.json

## Source/original contract

The imported source file must be copied into the session's `source/` directory.

The application must not overwrite or modify the preserved source after import.

`session.json` must identify the preserved source file.

A reopen operation must use the already preserved source identity and must not import or copy the source again.

## Session metadata

`session.json` contains only the minimum metadata required to identify and reopen the session.

Initial fields:

- schemaVersion
- sessionId
- createdAt
- source.originalName
- source.storedName
- source.relativePath
- source.sizeBytes

Transcript content must not be stored in `session.json`.

## Raw transcript contract

`raw-transcript.json` stores the original ASR result used by Evidence Transcriber.

It must include:

- schemaVersion
- sessionId
- source reference
- ASR metadata
- transcript segments
- start timestamp for each segment
- end timestamp for each segment
- text for each segment

## Immutability rule

Once a raw transcript has been successfully persisted, a normal reopen operation must not modify it.

Reopen must only read persisted session and raw transcript data.

Reopen must not:

- rerun ASR
- regenerate timestamps
- silently correct transcript text
- overwrite the preserved source
- rewrite raw transcript merely because it was opened

## Reopen gate

The slice passes only if a session can be created, the process can be ended, and the same session can later be reopened from disk while proving:

1. the same session ID is loaded,
2. the same source identity is loaded,
3. the preserved source still exists,
4. source size is unchanged,
5. raw transcript still exists,
6. transcript text is unchanged,
7. segment timestamps are unchanged,
8. reopening did not invoke ASR,
9. reopening did not modify the raw transcript file.

## Failure rule

A session must not be represented as successfully persisted unless all mandatory persistence writes for that stage have succeeded.

No source or raw transcript may be deleted as part of a normal failure path.

## Deferred

Not part of this slice:

- edited transcript
- transcript editor
- export
- recorder UI
- AI interpretation
- database abstraction
- cloud sync
- generalized migration framework