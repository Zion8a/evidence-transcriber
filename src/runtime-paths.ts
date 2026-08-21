export function getSessionsRoot(): string {
  return (
    process.env.EVIDENCE_TRANSCRIBER_SESSIONS_ROOT ??
    ".\\local-sessions"
  );
}

export function getUploadRoot(): string {
  return (
    process.env.EVIDENCE_TRANSCRIBER_UPLOAD_ROOT ??
    ".\\local-ui-uploads"
  );
}

export function getExportRoot(): string {
  return (
    process.env.EVIDENCE_TRANSCRIBER_EXPORT_ROOT ??
    ".\\local-ui-exports"
  );
}

export function getFfmpegPath(): string {
  return (
    process.env.EVIDENCE_TRANSCRIBER_FFMPEG_PATH ??
    "ffmpeg"
  );
}

export function getWhisperCliPath(): string {
  return (
    process.env.EVIDENCE_TRANSCRIBER_WHISPER_CLI_PATH ??
    ".\\spike\\whisper.cpp\\build-static-release\\bin\\whisper-cli.exe"
  );
}

export function getWhisperModelPath(): string {
  return (
    process.env.EVIDENCE_TRANSCRIBER_WHISPER_MODEL_PATH ??
    ".\\models\\ggml-medium.bin"
  );
}
