import { createServer } from "node:http";
import {
  createReadStream,
  createWriteStream,
} from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import {
  basename,
  join,
} from "node:path";
import { randomUUID } from "node:crypto";
import {
  exportTranscriptToTxt,
  reopenSession,
  saveEditedTranscript,
} from "./persistence.js";
import {
  transcribeImportedM4a,
} from "./transcription.js";
import {
  isSupportedInputFile,
  supportedInputLabel,
} from "./supported-formats.js";
import {
  getExportRoot,
  getRecordingsRoot,
  getSessionsRoot,
  getUploadRoot,
} from "./runtime-paths.js";
import {
  createRecordingTarget,
  finalizeRecording,
  markRecordingTranscribed,
  reopenRecording,
  type RecordingTarget,
} from "./recording-persistence.js";
import {
  isRecording,
  startRecording,
  stopRecording,
} from "./recorder.js";

const host = "127.0.0.1";
const port = 4317;

let activeRecordingTarget:
  RecordingTarget | null =
  null;

const html = `<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >
  <title>Evidence Transcriber</title>

  <style>
    body {
      font-family: system-ui, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 48px 24px;
      line-height: 1.5;
    }

    h1 {
      margin-bottom: 8px;
    }

    .subtitle {
      color: #555;
      margin-top: 0;
    }

    .panel {
      margin-top: 32px;
      padding: 24px;
      border: 1px solid #ccc;
      border-radius: 8px;
    }

    .controls {
      display: grid;
      grid-template-columns: minmax(280px, 360px) 180px;
      gap: 14px;
      align-items: center;
      margin-top: 16px;
    }

    button,
    select,
    input[type="file"]::file-selector-button {
      font: inherit;
      border: 1px solid #aaa;
      border-radius: 6px;
      background: #f7f7f7;
    }

    button {
      min-height: 46px;
      padding: 10px 18px;
      cursor: pointer;
    }

    select {
      width: 100%;
      min-height: 46px;
      padding: 8px 12px;
      background: white;
    }

    input[type="file"] {
      width: 100%;
      font: inherit;
    }

    input[type="file"]::file-selector-button {
      min-height: 42px;
      margin-right: 12px;
      padding: 8px 14px;
      cursor: pointer;
    }

    button:disabled {
      cursor: not-allowed;
    }

    #status {
      margin-top: 20px;
      font-weight: 600;
    }

    textarea {
      width: 100%;
      min-height: 360px;
      margin-top: 20px;
      padding: 16px;
      box-sizing: border-box;
      font: inherit;
      line-height: 1.5;
      resize: vertical;
    }

    .metadata {
      margin-top: 12px;
      color: #555;
      font-size: 0.95rem;
    }

    .editor-controls {
      display: flex;
      gap: 12px;
      margin-top: 16px;
      flex-wrap: wrap;
    }

    .error {
      color: #a00000;
    }
  </style>
</head>

<body>
  <h1>Evidence Transcriber</h1>

  <p class="subtitle">
    Local-first transcription with preserved source and transcript provenance.
  </p>

  <div class="panel">
    <h2>Spela in</h2>

    <p class="subtitle">
      Spelar in systemljud och mikrofon.
    </p>

    <div class="editor-controls">
      <button
        id="record-start"
        type="button"
      >
        Spela in
      </button>

      <button
        id="record-stop"
        type="button"
        disabled
      >
        Stoppa
      </button>
    </div>

    <div
      id="record-status"
      class="metadata"
    >
      Redo att spela in.
    </div>

    <div
      id="record-metadata"
      class="metadata"
    ></div>

    <div
      id="record-actions"
      class="editor-controls"
      hidden
    >
      <button
        id="record-transcribe"
        type="button"
      >
        Transkribera nu
      </button>

      <button
        id="record-save-audio"
        type="button"
      >
        Spara ljudfil…
      </button>
    </div>

    <div class="controls">
      <select id="recording-select">
        <option value="">
          Välj sparad inspelning
        </option>
      </select>

      <button
        id="recording-open"
        type="button"
      >
        Öppna inspelning
      </button>
    </div>
  </div>

  <div class="panel">
    <h2>Transkribera</h2>

    <div class="controls">
      <input
        id="file"
        type="file"
        accept=".m4a,.mp3,.wav,.mp4,audio/mp4,audio/mpeg,audio/wav,video/mp4"
      >

      <button
        id="transcribe"
        type="button"
      >
        Transkribera
      </button>
    </div>

    <div class="controls">
      <select id="session-select">
        <option value="">
          Välj sparad session
        </option>
      </select>

      <button
        id="reopen"
        type="button"
      >
        Öppna session
      </button>
    </div>

    <div id="status">
      Välj en M4A-, MP3-, WAV- eller MP4-fil.
    </div>

    <div
      id="metadata"
      class="metadata"
    ></div>

    <textarea
      id="transcript"
      placeholder="Transcriptet visas här efter transkribering."
      disabled
    ></textarea>

    <div class="editor-controls">
      <button
        id="save"
        type="button"
        disabled
      >
        Spara ändringar
      </button>

      <button
        id="export"
        type="button"
        disabled
      >
        Exportera TXT
      </button>
    </div>
  </div>

  <script>
    const fileInput =
      document.getElementById('file');

    const transcribeButton =
      document.getElementById('transcribe');

    const saveButton =
      document.getElementById('save');

    const exportButton =
      document.getElementById('export');

    const sessionSelect =
      document.getElementById('session-select');

    const reopenButton =
      document.getElementById('reopen');

    const recordStartButton =
      document.getElementById('record-start');

    const recordStopButton =
      document.getElementById('record-stop');

    const recordStatus =
      document.getElementById('record-status');

    const recordMetadata =
      document.getElementById('record-metadata');

    const recordActions =
      document.getElementById('record-actions');

    const recordTranscribeButton =
      document.getElementById('record-transcribe');

    const recordSaveAudioButton =
      document.getElementById('record-save-audio');

    const recordingSelect =
      document.getElementById('recording-select');

    const recordingOpenButton =
      document.getElementById('recording-open');

    const status =
      document.getElementById('status');

    const metadata =
      document.getElementById('metadata');

    const transcript =
      document.getElementById('transcript');

    let currentSessionId = null;
    let currentRecordingId = null;

    transcript.addEventListener(
      'input',
      () => {
        if (currentSessionId) {
          exportButton.disabled = true;
        }
      },
    );

    recordStartButton.addEventListener(
      'click',
      async () => {
        recordStatus.classList.remove('error');
        recordStatus.textContent =
          'Startar inspelning...';

        recordActions.hidden = true;
        recordMetadata.textContent = '';
        currentRecordingId = null;

        recordStartButton.disabled = true;
        recordStopButton.disabled = true;

        try {
          const response =
            await fetch(
              '/api/record/start',
              {
                method: 'POST',
              },
            );

          const result =
            await response.json();

          if (!response.ok) {
            throw new Error(
              result.error ??
                'Inspelningen kunde inte startas.',
            );
          }

          currentRecordingId =
            result.recordingId;

          recordMetadata.textContent = '';

          recordStatus.textContent =
            'Inspelning pågår...';

          recordStopButton.disabled = false;
        } catch (error) {
          recordStatus.classList.add('error');

          recordStatus.textContent =
            error instanceof Error
              ? error.message
              : 'Inspelningen kunde inte startas.';

          recordStartButton.disabled = false;
        }
      },
    );

    recordStopButton.addEventListener(
      'click',
      async () => {
        recordStatus.classList.remove('error');
        recordStatus.textContent =
          'Stoppar och sparar inspelningen...';

        recordStopButton.disabled = true;

        try {
          const response =
            await fetch(
              '/api/record/stop',
              {
                method: 'POST',
              },
            );

          const result =
            await response.json();

          if (!response.ok) {
            throw new Error(
              result.error ??
                'Inspelningen kunde inte stoppas.',
            );
          }

          currentRecordingId =
            result.recordingId;

          const sizeMb =
            (
              result.source.sizeBytes /
              1024 /
              1024
            ).toFixed(1);

          recordMetadata.textContent =
            'Ljudfil: ' +
            sizeMb +
            ' MB';

          recordStatus.textContent =
            'Inspelningen är sparad. Vad vill du göra?';

          recordActions.hidden = false;
          recordStartButton.disabled = false;

          await loadRecordings();
        } catch (error) {
          recordStatus.classList.add('error');

          recordStatus.textContent =
            error instanceof Error
              ? error.message
              : 'Inspelningen kunde inte stoppas.';

          recordStartButton.disabled = false;
        }
      },
    );
    recordTranscribeButton.addEventListener(
      'click',
      async () => {
        if (!currentRecordingId) {
          recordStatus.classList.add('error');
          recordStatus.textContent =
            'Ingen sparad inspelning att transkribera.';
          return;
        }

        recordStatus.classList.remove('error');
        recordStatus.textContent =
          'Transkriberar inspelningen lokalt...';

        recordTranscribeButton.disabled = true;
        recordSaveAudioButton.disabled = true;
        recordStartButton.disabled = true;

        status.classList.remove('error');
        status.textContent =
          'Transkriberar inspelningen lokalt...';

        transcript.value = '';
        transcript.disabled = true;
        saveButton.disabled = true;
        exportButton.disabled = true;

        try {
          const response =
            await fetch(
              '/api/record/transcribe?recordingId=' +
                encodeURIComponent(
                  currentRecordingId,
                ),
              {
                method: 'POST',
              },
            );

          const result =
            await response.json();

          if (!response.ok) {
            throw new Error(
              result.error ??
                'Inspelningen kunde inte transkriberas.',
            );
          }

          currentSessionId =
            result.sessionId;

          transcript.value =
            result.text;

          transcript.disabled = false;
          saveButton.disabled = false;

          metadata.textContent =
            'Segment: ' +
            result.segmentCount;

          status.textContent =
            'Transkriberingen är klar. Spara innan export.';

          recordStatus.textContent =
            'Inspelningen är transkriberad.';

          recordTranscribeButton.disabled = true;
          recordSaveAudioButton.disabled = false;
          recordStartButton.disabled = false;

          await loadRecordings();
          await loadSessions();
        } catch (error) {
          recordStatus.classList.add('error');

          recordStatus.textContent =
            error instanceof Error
              ? error.message
              : 'Inspelningen kunde inte transkriberas.';

          status.classList.add('error');
          status.textContent =
            recordStatus.textContent;

          recordTranscribeButton.disabled = false;
          recordSaveAudioButton.disabled = false;
          recordStartButton.disabled = false;
        }
      },
    );

    recordSaveAudioButton.addEventListener(
      'click',
      () => {
        if (!currentRecordingId) {
          recordStatus.classList.add('error');
          recordStatus.textContent =
            'Ingen sparad ljudfil finns.';
          return;
        }

        const link =
          document.createElement('a');

        link.href =
          '/api/record/audio?recordingId=' +
          encodeURIComponent(
            currentRecordingId,
          );

        document.body.appendChild(link);
        link.click();
        link.remove();
      },
    );
    async function loadRecordings() {
      try {
        const response =
          await fetch(
            '/api/recordings',
          );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ??
              'Kunde inte läsa sparade inspelningar.',
          );
        }

        recordingSelect.innerHTML =
          '<option value="">Välj sparad inspelning</option>';

        for (const item of result.recordings) {
          const option =
            document.createElement(
              'option',
            );

          option.value =
            item.recordingId;

          const createdAt =
            new Date(
              item.createdAt,
            );

          const formattedDate =
            createdAt.toLocaleString(
              'sv-SE',
              {
                dateStyle: 'medium',
                timeStyle: 'short',
              },
            );

          option.textContent =
            'Inspelning – ' +
            formattedDate;

          recordingSelect.appendChild(
            option,
          );
        }
      } catch (error) {
        recordStatus.classList.add(
          'error',
        );

        recordStatus.textContent =
          error instanceof Error
            ? error.message
            : 'Kunde inte läsa sparade inspelningar.';
      }
    }

    recordingOpenButton.addEventListener(
      'click',
      () => {
        const recordingId =
          recordingSelect.value;

        if (!recordingId) {
          recordStatus.classList.add(
            'error',
          );

          recordStatus.textContent =
            'Välj en sparad inspelning först.';
          return;
        }

        currentRecordingId =
          recordingId;

        recordStatus.classList.remove(
          'error',
        );

        recordStatus.textContent =
          'Sparad inspelning vald. Vad vill du göra?';

        recordMetadata.textContent = '';

        recordActions.hidden = false;

        recordTranscribeButton.disabled = false;
        recordSaveAudioButton.disabled = false;
      },
    );
    async function loadSessions() {
      try {
        const response =
          await fetch('/api/sessions');

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ??
              'Kunde inte läsa sparade sessioner.',
          );
        }

        sessionSelect.innerHTML =
          '<option value="">Välj sparad session</option>';

        for (const item of result.sessions) {
          const option =
            document.createElement('option');

          option.value =
            item.sessionId;

          const createdAt =
            new Date(
              item.createdAt,
            );

          const formattedDate =
            createdAt.toLocaleString(
              'sv-SE',
              {
                dateStyle: 'medium',
                timeStyle: 'short',
              },
            );

          const isRecordedSource =
            item.source ===
            'recording.wav';

          option.textContent =
            isRecordedSource
              ? 'Inspelning – ' +
                formattedDate
              : item.source +
                ' – ' +
                formattedDate;

          sessionSelect.appendChild(
            option,
          );
        }
      } catch (error) {
        status.classList.add('error');

        status.textContent =
          error instanceof Error
            ? error.message
            : 'Kunde inte läsa sparade sessioner.';
      }
    }

    reopenButton.addEventListener(
      'click',
      async () => {
        const sessionId =
          sessionSelect.value;

        if (!sessionId) {
          status.classList.add('error');
          status.textContent =
            'Välj en sparad session först.';
          return;
        }

        status.classList.remove('error');
        status.textContent =
          'Öppnar session...';

        reopenButton.disabled = true;

        try {
          const response =
            await fetch(
              '/api/reopen?sessionId=' +
                encodeURIComponent(
                  sessionId,
                ),
            );

          const result =
            await response.json();

          if (!response.ok) {
            throw new Error(
              result.error ??
                'Sessionen kunde inte öppnas.',
            );
          }

          currentSessionId =
            result.sessionId;

          transcript.value =
            result.text;

          transcript.disabled = false;
          saveButton.disabled = false;
          exportButton.disabled = false;

          metadata.textContent =
            'Session: ' +
            result.sessionId +
            ' | Segment: ' +
            result.segmentCount +
            (result.hasEdited
              ? ' | Edited'
              : ' | Raw');

          status.textContent =
            'Sessionen är öppnad.';
        } catch (error) {
          status.classList.add('error');

          status.textContent =
            error instanceof Error
              ? error.message
              : 'Sessionen kunde inte öppnas.';
        } finally {
          reopenButton.disabled = false;
        }
      },
    );

    void loadRecordings();
    void loadSessions();
    transcribeButton.addEventListener(
      'click',
      async () => {
        const file = fileInput.files[0];

        if (!file) {
          status.textContent =
            'Välj en fil först.';
          return;
        }

        if (
          !['.m4a', '.mp3', '.wav', '.mp4'].some(
            (extension) =>
              file.name.toLowerCase().endsWith(extension),
          )
        ) {
          status.textContent =
            'Student Alpha stöder M4A, MP3, WAV och MP4.';
          status.classList.add('error');
          return;
        }

        status.classList.remove('error');
        status.textContent =
          'Transkriberar lokalt...';

        metadata.textContent = '';
        transcript.value = '';
        transcript.disabled = true;

        saveButton.disabled = true;
        exportButton.disabled = true;

        currentSessionId = null;

        transcribeButton.disabled = true;
        fileInput.disabled = true;

        try {
          const response = await fetch(
            '/api/transcribe',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/octet-stream',
                'X-File-Name':
                  encodeURIComponent(file.name),
              },
              body: file,
            },
          );

          const result =
            await response.json();

          if (!response.ok) {
            throw new Error(
              result.error ??
                'Transkriberingen misslyckades.',
            );
          }

          currentSessionId =
            result.sessionId;

          transcript.value =
            result.text;

          transcript.disabled = false;
          saveButton.disabled = false;

          metadata.textContent =
            'Session: ' +
            result.sessionId +
            ' | Segment: ' +
            result.segmentCount;

          status.textContent =
            'Transkriberingen är klar. Spara innan export.';
        } catch (error) {
          status.classList.add('error');

          status.textContent =
            error instanceof Error
              ? error.message
              : 'Ett okänt fel inträffade.';
        } finally {
          transcribeButton.disabled = false;
          fileInput.disabled = false;
        }
      },
    );

    saveButton.addEventListener(
      'click',
      async () => {
        if (!currentSessionId) {
          status.classList.add('error');
          status.textContent =
            'Ingen aktiv session att spara.';
          return;
        }

        status.classList.remove('error');
        status.textContent =
          'Sparar ändringar...';

        saveButton.disabled = true;
        exportButton.disabled = true;

        try {
          const response = await fetch(
            '/api/save',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
                sessionId:
                  currentSessionId,
                text:
                  transcript.value,
              }),
            },
          );

          const result =
            await response.json();

          if (!response.ok) {
            throw new Error(
              result.error ??
                'Sparningen misslyckades.',
            );
          }

          status.textContent =
            'Ändringarna är sparade.';

          exportButton.disabled = false;
        } catch (error) {
          status.classList.add('error');

          status.textContent =
            error instanceof Error
              ? error.message
              : 'Ett okänt fel inträffade.';
        } finally {
          saveButton.disabled = false;
        }
      },
    );

    exportButton.addEventListener(
      'click',
      async () => {
        if (!currentSessionId) {
          status.classList.add('error');
          status.textContent =
            'Ingen aktiv session att exportera.';
          return;
        }

        status.classList.remove('error');
        status.textContent =
          'Exporterar TXT...';

        exportButton.disabled = true;

        try {
          const response = await fetch(
            '/api/export?sessionId=' +
              encodeURIComponent(
                currentSessionId,
              ),
          );

          if (!response.ok) {
            let message =
              'Exporten misslyckades.';

            try {
              const result =
                await response.json();

              message =
                result.error ?? message;
            } catch {
              // Keep fallback message.
            }

            throw new Error(message);
          }

          const blob =
            await response.blob();

          const url =
            URL.createObjectURL(blob);

          const link =
            document.createElement('a');

          link.href = url;

          const contentDisposition =
            response.headers.get(
              'Content-Disposition',
            );

          const fileNameMatch =
            contentDisposition?.match(
              /filename="([^"]+)"/,
            );

          link.download =
            fileNameMatch?.[1] ??
            'evidence-transcript.txt';

          document.body.appendChild(link);
          link.click();
          link.remove();

          URL.revokeObjectURL(url);

          status.textContent =
            'TXT-exporten är klar.';
        } catch (error) {
          status.classList.add('error');

          status.textContent =
            error instanceof Error
              ? error.message
              : 'Ett okänt fel inträffade.';
        } finally {
          exportButton.disabled = false;
        }
      },
    );
  </script>
</body>
</html>`;

function sendJson(
  response: import("node:http").ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.writeHead(statusCode, {
    "Content-Type":
      "application/json; charset=utf-8",
  });

  response.end(
    JSON.stringify(body),
  );
}

async function readJsonBody(
  request: import("node:http").IncomingMessage,
): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk),
    );
  }

  const body =
    Buffer.concat(chunks).toString("utf8");

  return JSON.parse(body);
}

const server = createServer(
  async (request, response) => {
    if (
      request.method === "GET" &&
      request.url === "/"
    ) {
      response.writeHead(200, {
        "Content-Type":
          "text/html; charset=utf-8",
      });

      response.end(html);
      return;
    }

    if (
      request.method === "GET" &&
      request.url === "/api/recordings"
    ) {
      try {
        const recordingsRoot =
          getRecordingsRoot();

        await mkdir(
          recordingsRoot,
          {
            recursive: true,
          },
        );

        const entries =
          await readdir(
            recordingsRoot,
            {
              withFileTypes: true,
            },
          );

        const recordings = [];

        for (const entry of entries) {
          if (!entry.isDirectory()) {
            continue;
          }

          const recordingDirectory =
            join(
              recordingsRoot,
              entry.name,
            );

          try {
            const recording =
              await reopenRecording(
                recordingDirectory,
              );

            if (
              recording.transcriptionStatus !==
              "not_transcribed"
            ) {
              continue;
            }

            recordings.push({
              recordingId:
                recording.recordingId,
              createdAt:
                recording.createdAt,
              sizeBytes:
                recording.source.sizeBytes,
              transcriptionStatus:
                recording.transcriptionStatus,
            });
          } catch {
            // Ignore incomplete or invalid recordings.
          }
        }

        recordings.sort(
          (a, b) =>
            b.createdAt.localeCompare(
              a.createdAt,
            ),
        );

        sendJson(
          response,
          200,
          {
            recordings,
          },
        );
      } catch (error) {
        console.error(error);

        sendJson(
          response,
          500,
          {
            error:
              "Kunde inte läsa sparade inspelningar.",
          },
        );
      }

      return;
    }
    if (
      request.method === "POST" &&
      request.url === "/api/record/start"
    ) {
      if (
        activeRecordingTarget ||
        isRecording()
      ) {
        sendJson(
          response,
          409,
          {
            error:
              "En inspelning pågår redan.",
          },
        );
        return;
      }

      try {
        const target =
          await createRecordingTarget(
            getRecordingsRoot(),
          );

        await startRecording(
          target.sourcePath,
        );

        activeRecordingTarget =
          target;

        sendJson(
          response,
          200,
          {
            recordingId:
              target.recordingId,
            recording: true,
          },
        );
      } catch (error) {
        console.error(error);

        sendJson(
          response,
          500,
          {
            error:
              error instanceof Error
                ? error.message
                : "Inspelningen kunde inte startas.",
          },
        );
      }

      return;
    }

    if (
      request.method === "POST" &&
      request.url === "/api/record/stop"
    ) {
      const target =
        activeRecordingTarget;

      if (!target) {
        sendJson(
          response,
          409,
          {
            error:
              "Ingen inspelning pågår.",
          },
        );
        return;
      }

      try {
        await stopRecording();

        const metadata =
          await finalizeRecording(
            target,
          );

        activeRecordingTarget =
          null;

        sendJson(
          response,
          200,
          {
            recordingId:
              metadata.recordingId,
            recording: false,
            createdAt:
              metadata.createdAt,
            captureMode:
              metadata.captureMode,
            transcriptionStatus:
              metadata.transcriptionStatus,
            source:
              metadata.source,
          },
        );
      } catch (error) {
        console.error(error);

        sendJson(
          response,
          500,
          {
            error:
              error instanceof Error
                ? error.message
                : "Inspelningen kunde inte stoppas.",
          },
        );
      }

      return;
    }
    if (
      request.method === "POST" &&
      request.url?.startsWith(
        "/api/record/transcribe?",
      )
    ) {
      const url =
        new URL(
          request.url,
          `http://${host}:${port}`,
        );

      const recordingId =
        url.searchParams.get(
          "recordingId",
        );

      if (
        !recordingId ||
        basename(recordingId) !==
          recordingId
      ) {
        sendJson(
          response,
          400,
          {
            error:
              "Ogiltigt recording-ID.",
          },
        );
        return;
      }

      const recordingDirectory =
        join(
          getRecordingsRoot(),
          recordingId,
        );

      try {
        const recording =
          await reopenRecording(
            recordingDirectory,
          );

        if (
          recording.transcriptionStatus ===
          "transcribed"
        ) {
          sendJson(
            response,
            409,
            {
              error:
                "Inspelningen är redan transkriberad.",
              sessionId:
                recording.transcriptionSessionId,
            },
          );
          return;
        }

        const sourcePath =
          join(
            recordingDirectory,
            recording.source.relativePath,
          );

        const result =
          await transcribeImportedM4a(
            sourcePath,
          );

        const sessionId =
          result.reopened.metadata
            .sessionId;

        await markRecordingTranscribed(
          recordingDirectory,
          sessionId,
        );

        const transcriptText =
          result.reopened.rawTranscript.segments
            .map(
              (segment) =>
                segment.text.trim(),
            )
            .join("\n\n");

        sendJson(
          response,
          200,
          {
            recordingId,
            sessionId,
            segmentCount:
              result.reopened.rawTranscript
                .segments.length,
            text:
              transcriptText,
          },
        );
      } catch (error) {
        console.error(error);

        sendJson(
          response,
          500,
          {
            error:
              error instanceof Error
                ? error.message
                : "Inspelningen kunde inte transkriberas.",
          },
        );
      }

      return;
    }

    if (
      request.method === "GET" &&
      request.url?.startsWith(
        "/api/record/audio?",
      )
    ) {
      const url =
        new URL(
          request.url,
          `http://${host}:${port}`,
        );

      const recordingId =
        url.searchParams.get(
          "recordingId",
        );

      if (
        !recordingId ||
        basename(recordingId) !==
          recordingId
      ) {
        sendJson(
          response,
          400,
          {
            error:
              "Ogiltigt recording-ID.",
          },
        );
        return;
      }

      const recordingDirectory =
        join(
          getRecordingsRoot(),
          recordingId,
        );

      try {
        const recording =
          await reopenRecording(
            recordingDirectory,
          );

        const sourcePath =
          join(
            recordingDirectory,
            recording.source.relativePath,
          );

        const date =
          recording.createdAt
            .slice(0, 10);

        const downloadName =
          `inspelning-${date}.wav`;

        response.writeHead(
          200,
          {
            "Content-Type":
              "audio/wav",
            "Content-Length":
              recording.source.sizeBytes,
            "Content-Disposition":
              `attachment; filename="${downloadName}"`,
          },
        );

        createReadStream(
          sourcePath,
        ).pipe(response);
      } catch (error) {
        console.error(error);

        sendJson(
          response,
          500,
          {
            error:
              error instanceof Error
                ? error.message
                : "Ljudfilen kunde inte öppnas.",
          },
        );
      }

      return;
    }
    if (
      request.method === "POST" &&
      request.url === "/api/transcribe"
    ) {
      const encodedFileName =
        request.headers["x-file-name"];

      if (
        typeof encodedFileName !== "string"
      ) {
        sendJson(
          response,
          400,
          {
            error:
              "Filnamn saknas.",
          },
        );
        return;
      }

      const originalFileName =
        basename(
          decodeURIComponent(
            encodedFileName,
          ),
        );

      if (!isSupportedInputFile(originalFileName)) {
        sendJson(
          response,
          400,
          {
            error:
              `Student Alpha stöder ${supportedInputLabel()}.`,
          },
        );
        return;
      }

      const uploadRoot =
        getUploadRoot();

      const temporaryDirectory =
        join(
          uploadRoot,
          randomUUID(),
        );

      const temporarySourcePath =
        join(
          temporaryDirectory,
          originalFileName,
        );

      try {
        await mkdir(
          temporaryDirectory,
          {
            recursive: true,
          },
        );

        await pipeline(
          request,
          createWriteStream(
            temporarySourcePath,
          ),
        );

        const result =
          await transcribeImportedM4a(
            temporarySourcePath,
          );

        const text =
          result.reopened.rawTranscript.segments
            .map(
              (segment) =>
                segment.text.trim(),
            )
            .join("\n\n");

        sendJson(
          response,
          200,
          {
            sessionId:
              result.reopened.metadata
                .sessionId,
            segmentCount:
              result.reopened.rawTranscript
                .segments.length,
            text,
          },
        );
      } catch (error) {
        console.error(error);

        sendJson(
          response,
          500,
          {
            error:
              error instanceof Error
                ? error.message
                : "Transkriberingen misslyckades.",
          },
        );
      } finally {
        await rm(
          temporaryDirectory,
          {
            recursive: true,
            force: true,
          },
        );
      }

      return;
    }

    if (
      request.method === "POST" &&
      request.url === "/api/save"
    ) {
      try {
        const body =
          await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null ||
          !("sessionId" in body) ||
          !("text" in body) ||
          typeof body.sessionId !== "string" ||
          typeof body.text !== "string"
        ) {
          sendJson(
            response,
            400,
            {
              error:
                "Ogiltig sparningsbegäran.",
            },
          );
          return;
        }

        if (
          basename(body.sessionId) !==
          body.sessionId
        ) {
          sendJson(
            response,
            400,
            {
              error:
                "Ogiltigt session-ID.",
            },
          );
          return;
        }

        const sessionDirectory =
          join(
            getSessionsRoot(),
            body.sessionId,
          );

        const reopened =
          await reopenSession(
            sessionDirectory,
          );

        await saveEditedTranscript(
          sessionDirectory,
          {
            schemaVersion: 1,
            sessionId:
              reopened.metadata.sessionId,
            source: {
              relativePath:
                reopened.metadata.source
                  .relativePath,
            },
            basedOnRawTranscript: {
              relativePath:
                "raw-transcript.json",
            },
            updatedAt:
              new Date().toISOString(),
            text:
              body.text,
          },
        );

        const verified =
          await reopenSession(
            sessionDirectory,
          );

        sendJson(
          response,
          200,
          {
            sessionId:
              verified.metadata.sessionId,
            saved: true,
            characters:
              verified.editedTranscript
                ?.text.length ?? 0,
          },
        );
      } catch (error) {
        console.error(error);

        sendJson(
          response,
          500,
          {
            error:
              error instanceof Error
                ? error.message
                : "Sparningen misslyckades.",
          },
        );
      }

      return;
    }

    if (
      request.method === "GET" &&
      request.url === "/api/sessions"
    ) {
      try {
        await mkdir(
          getSessionsRoot(),
          {
            recursive: true,
          },
        );

        const entries = await readdir(
          getSessionsRoot(),
          {
            withFileTypes: true,
          },
        );

        const sessions = [];

        for (const entry of entries) {
          if (!entry.isDirectory()) {
            continue;
          }

          const sessionDirectory =
            join(
              getSessionsRoot(),
              entry.name,
            );

          try {
            const reopened =
              await reopenSession(
                sessionDirectory,
              );

            sessions.push({
              sessionId:
                reopened.metadata.sessionId,
              createdAt:
                reopened.metadata.createdAt,
              source:
                reopened.metadata.source
                  .originalName,
              hasEdited:
                reopened.editedTranscript !==
                undefined,
            });
          } catch {
            // Ignore incomplete or invalid sessions.
          }
        }

        sendJson(
          response,
          200,
          {
            sessions,
          },
        );
      } catch (error) {
        console.error(error);

        sendJson(
          response,
          500,
          {
            error:
              "Kunde inte läsa sparade sessioner.",
          },
        );
      }

      return;
    }

    if (
      request.method === "GET" &&
      request.url?.startsWith(
        "/api/reopen?",
      )
    ) {
      const url =
        new URL(
          request.url,
          `http://${host}:${port}`,
        );

      const sessionId =
        url.searchParams.get(
          "sessionId",
        );

      if (
        !sessionId ||
        basename(sessionId) !== sessionId
      ) {
        sendJson(
          response,
          400,
          {
            error:
              "Ogiltigt session-ID.",
          },
        );
        return;
      }

      try {
        const sessionDirectory =
          join(
            getSessionsRoot(),
            sessionId,
          );

        const reopened =
          await reopenSession(
            sessionDirectory,
          );

        const text =
          reopened.editedTranscript?.text ??
          reopened.rawTranscript.segments
            .map(
              (segment) =>
                segment.text.trim(),
            )
            .join("\n\n");

        sendJson(
          response,
          200,
          {
            sessionId:
              reopened.metadata.sessionId,
            source:
              reopened.metadata.source
                .originalName,
            segmentCount:
              reopened.rawTranscript
                .segments.length,
            hasEdited:
              reopened.editedTranscript !==
              undefined,
            text,
          },
        );
      } catch (error) {
        console.error(error);

        sendJson(
          response,
          500,
          {
            error:
              error instanceof Error
                ? error.message
                : "Sessionen kunde inte öppnas.",
          },
        );
      }

      return;
    }
    if (
      request.method === "GET" &&
      request.url?.startsWith(
        "/api/export?",
      )
    ) {
      const url =
        new URL(
          request.url,
          `http://${host}:${port}`,
        );

      const sessionId =
        url.searchParams.get(
          "sessionId",
        );

      if (!sessionId) {
        sendJson(
          response,
          400,
          {
            error:
              "Session-ID saknas.",
          },
        );
        return;
      }

      if (
        basename(sessionId) !==
        sessionId
      ) {
        sendJson(
          response,
          400,
          {
            error:
              "Ogiltigt session-ID.",
          },
        );
        return;
      }

      const sessionDirectory =
        join(
          getSessionsRoot(),
          sessionId,
        );

      const exportRoot =
        getExportRoot();

      const temporaryExportDirectory =
        join(
          exportRoot,
          randomUUID(),
        );

      const temporaryExportPath =
        join(
          temporaryExportDirectory,
          "transcript.txt",
        );

      try {
        await mkdir(
          temporaryExportDirectory,
          {
            recursive: true,
          },
        );

        await exportTranscriptToTxt(
          sessionDirectory,
          temporaryExportPath,
        );

        const exportedText =
          await readFile(
            temporaryExportPath,
          );

        const reopened =
          await reopenSession(
            sessionDirectory,
          );

        const createdAt =
          new Date(
            reopened.metadata.createdAt,
          );

        const pad =
          (value: number): string =>
            String(value).padStart(
              2,
              "0",
            );

        const datePart =
          `${createdAt.getFullYear()}-${pad(
            createdAt.getMonth() + 1,
          )}-${pad(
            createdAt.getDate(),
          )}-${pad(
            createdAt.getHours(),
          )}-${pad(
            createdAt.getMinutes(),
          )}`;

        const originalName =
          reopened.metadata.source
            .originalName;

        const isRecordedSource =
          originalName ===
          "recording.wav";

        const sourceBaseName =
          originalName.replace(
            /\.[^.]+$/,
            "",
          );

        const safeSourceBaseName =
          sourceBaseName.replace(
            /[^a-zA-Z0-9åäöÅÄÖ_-]+/g,
            "-",
          );

        const downloadName =
          isRecordedSource
            ? `Inspelning-${datePart}.txt`
            : `${safeSourceBaseName}-${datePart}.txt`;

        response.writeHead(
          200,
          {
            "Content-Type":
              "text/plain; charset=utf-8",
            "Content-Disposition":
              `attachment; filename="${downloadName}"`,
            "Content-Length":
              exportedText.length,
          },
        );

        response.end(
          exportedText,
        );
      } catch (error) {
        console.error(error);

        sendJson(
          response,
          500,
          {
            error:
              error instanceof Error
                ? error.message
                : "Exporten misslyckades.",
          },
        );
      } finally {
        await rm(
          temporaryExportDirectory,
          {
            recursive: true,
            force: true,
          },
        );
      }

      return;
    }

    response.writeHead(404, {
      "Content-Type":
        "text/plain; charset=utf-8",
    });

    response.end("Not found");
  },
);

server.listen(
  port,
  host,
  () => {
    console.log("");
    console.log(
      "Evidence Transcriber Student Alpha",
    );
    console.log(
      `http://${host}:${port}`,
    );
    console.log("");
    console.log(
      "Press Ctrl+C to stop.",
    );
  },
);
