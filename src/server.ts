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
  renameSession,
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
  renameRecording,
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
    :root {
      color-scheme: dark;

      --bg: #08111f;
      --surface: #0f1b2d;
      --surface-raised: #142238;
      --surface-hover: #192a43;

      --border: #273850;
      --border-strong: #36506f;

      --text: #f3f7fb;
      --text-secondary: #a7b6c9;
      --text-muted: #71839a;

      --accent: #38bdf8;
      --accent-strong: #0ea5e9;
      --accent-text: #03111c;

      --success: #4ade80;
      --danger: #fb7185;

      --radius: 14px;
      --radius-small: 9px;

      --shadow:
        0 18px 45px
        rgba(0, 0, 0, 0.22);
    }

    * {
      box-sizing: border-box;
    }

    body {
      min-height: 100vh;
      margin: 0;
      padding: 48px 32px 80px;
      background:
        radial-gradient(
          circle at top left,
          rgba(56, 189, 248, 0.08),
          transparent 32rem
        ),
        var(--bg);
      color: var(--text);
      font-family:
        Inter,
        ui-sans-serif,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
      line-height: 1.5;
    }

    body > h1,
    body > p,
    body > section {
      width: min(100%, 1040px);
      margin-left: auto;
      margin-right: auto;
    }

    h1 {
      margin-top: 0;
      margin-bottom: 6px;
      font-size: clamp(
        2rem,
        4vw,
        2.7rem
      );
      line-height: 1.1;
      letter-spacing: -0.035em;
    }

    h2 {
      margin-top: 0;
      margin-bottom: 10px;
      font-size: 1.35rem;
      letter-spacing: -0.015em;
    }

    .subtitle {
      margin-top: 0;
      color: var(--text-secondary);
    }

    .panel {
      margin-top: 28px;
      padding: 28px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background:
        linear-gradient(
          180deg,
          rgba(255, 255, 255, 0.018),
          rgba(255, 255, 255, 0)
        ),
        var(--surface);
      box-shadow: var(--shadow);
    }

    .controls {
      display: grid;
      grid-template-columns:
        minmax(280px, 1fr)
        minmax(160px, 200px);
      gap: 14px;
      align-items: center;
      margin-top: 20px;
    }

    button,
    select,
    input[type="file"]::file-selector-button {
      font: inherit;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-small);
    }

    button {
      min-height: 46px;
      padding: 10px 18px;
      background: var(--surface-raised);
      color: var(--text);
      cursor: pointer;
      transition:
        background 120ms ease,
        border-color 120ms ease,
        transform 120ms ease;
    }

    button:hover:not(:disabled) {
      background: var(--surface-hover);
      border-color: #4c6788;
    }

    button:active:not(:disabled) {
      transform: translateY(1px);
    }

    button:focus-visible,
    select:focus-visible,
    textarea:focus-visible,
    input:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    button:disabled {
      opacity: 0.42;
      cursor: not-allowed;
    }

    select {
      width: 100%;
      min-height: 46px;
      padding: 8px 12px;
      background: var(--surface-raised);
      color: var(--text);
    }

    input[type="file"] {
      width: 100%;
      color: var(--text-secondary);
      font: inherit;
    }

    input[type="file"]::file-selector-button {
      min-height: 42px;
      margin-right: 12px;
      padding: 8px 14px;
      background: var(--surface-raised);
      color: var(--text);
      cursor: pointer;
    }

    #status {
      margin-top: 20px;
      font-weight: 600;
    }

    textarea {
      width: 100%;
      min-height: 380px;
      margin-top: 20px;
      padding: 20px;
      border: 1px solid var(--border);
      border-radius: var(--radius-small);
      background: #091524;
      color: var(--text);
      box-sizing: border-box;
      font: inherit;
      line-height: 1.6;
      resize: vertical;
    }

    textarea::placeholder {
      color: var(--text-muted);
    }

    .metadata {
      margin-top: 12px;
      color: var(--text-secondary);
      font-size: 0.94rem;
    }

    .editor-controls {
      display: flex;
      gap: 12px;
      margin-top: 18px;
      flex-wrap: wrap;
    }

    .error {
      color: var(--danger);
    }

    [hidden] {
      display: none !important;
    }

    .app-view[hidden] {
      display: none !important;
    }

    .start-actions {
      display: grid;
      grid-template-columns:
        repeat(
          3,
          minmax(0, 1fr)
        );
      gap: 16px;
      margin-top: 24px;
    }

    .start-action {
      min-height: 148px;
      width: 100%;
      padding: 22px;
      text-align: left;
      background: var(--surface-raised);
    }

    .start-action:hover:not(:disabled) {
      background: var(--surface-hover);
      border-color: var(--accent);
    }

    .start-action strong {
      display: inline-block;
      margin-bottom: 8px;
      color: var(--text);
      font-size: 1.08rem;
    }

    .start-action br + * {
      color: var(--text-secondary);
    }

    .back-button {
      min-height: 38px;
      margin-top: 24px;
      margin-bottom: 0;
      padding: 6px 12px;
      border-color: transparent;
      background: transparent;
      color: var(--text-secondary);
    }

    .back-button:hover:not(:disabled) {
      border-color: var(--border);
      background: var(--surface);
      color: var(--text);
    }

    #record-start,
    #record-transcribe,
    #transcribe,
    #save {
      border-color: var(--accent-strong);
      background: var(--accent);
      color: var(--accent-text);
      font-weight: 700;
    }

    #record-start:hover:not(:disabled),
    #record-transcribe:hover:not(:disabled),
    #transcribe:hover:not(:disabled),
    #save:hover:not(:disabled) {
      background: #7dd3fc;
      border-color: #7dd3fc;
    }

    .work-list {
      display: grid;
      gap: 12px;
      margin-top: 16px;
    }

    .work-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 18px 20px;
      border: 1px solid var(--border);
      border-radius: var(--radius-small);
      background: var(--surface-raised);
    }

    .work-card:hover {
      border-color: var(--border-strong);
      background: var(--surface-hover);
    }

    .work-card-main {
      min-width: 0;
    }

    .work-card-title {
      margin: 0;
      color: var(--text);
      font-weight: 700;
    }

    .work-card-meta {
      margin-top: 4px;
      color: var(--text-secondary);
      font-size: 0.92rem;
    }

    .work-card-status {
      display: inline-flex;
      align-items: center;
      margin-top: 8px;
      padding: 3px 8px;
      border: 1px solid var(--border-strong);
      border-radius: 999px;
      color: var(--text-secondary);
      font-size: 0.82rem;
    }

    .work-empty {
      padding: 18px 0;
      color: var(--text-muted);
    }

    .work-card-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }

    .work-card button {
      flex: 0 0 auto;
    }

    .work-card .secondary-action {
      background: transparent;
      color: var(--text-secondary);
      border-color: var(--border-strong);
    }

    .work-card .secondary-action:hover {
      background: var(--surface-hover);
      color: var(--text);
    }

    .work-name-editor {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
    }

    .work-name-editor input {
      min-width: 260px;
      flex: 1;
      padding: 10px 12px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-small);
      background: var(--bg);
      color: var(--text);
      font: inherit;
    }

    @media (max-width: 760px) {
      body {
        padding:
          32px 18px
          60px;
      }

      .start-actions {
        grid-template-columns: 1fr;
      }

      .controls {
        grid-template-columns: 1fr;
      }

      .panel {
        padding: 22px;
      }
    }
  </style>
</head>

<body>
  <h1>Evidence Transcriber</h1>

  <p class="subtitle">
    Lokal transkribering med bevarad källa och tydlig spårbarhet.
  </p>

  <section
    id="view-start"
    class="app-view"
  >
    <div class="panel">
      <h2>Vad vill du göra?</h2>

      <div class="start-actions">
        <button
          id="nav-record"
          class="start-action"
          type="button"
        >
          <strong>Spela in</strong><br>
          Spela in systemljud och mikrofon.
        </button>

        <button
          id="nav-import"
          class="start-action"
          type="button"
        >
          <strong>Transkribera fil</strong><br>
          Välj en befintlig ljud- eller videofil.
        </button>

        <button
          id="nav-previous"
          class="start-action"
          type="button"
        >
          <strong>Tidigare arbete</strong><br>
          Öppna sparade inspelningar eller transkript.
        </button>
      </div>
    </div>
  </section>

  <section
    id="view-record"
    class="app-view"
    hidden
  >
    <button
      class="back-button"
      data-back-home
      type="button"
    >
      ← Tillbaka
    </button>

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


  </div>

  </section>

  <section
    id="view-import"
    class="app-view"
    hidden
  >
    <button
      class="back-button"
      data-back-home
      type="button"
    >
      ← Tillbaka
    </button>

  <div class="panel">
    <h2>Transkribera fil</h2>

    <p class="subtitle">
      Välj en ljud- eller videofil som ska transkriberas lokalt.
    </p>

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

    <div
      id="import-status"
      class="metadata"
    >
      M4A, MP3, WAV eller MP4.
    </div>
  </div>

  </section>

  <section
    id="view-previous"
    class="app-view"
    hidden
  >
    <button
      class="back-button"
      data-back-home
      type="button"
    >
      ← Tillbaka
    </button>

    <div class="panel">
      <h2>Tidigare arbete</h2>

      <p class="subtitle">
        Fortsätt med en sparad inspelning eller ett sparat transkript.
      </p>

      <h3>Sparade inspelningar</h3>

      <div
        id="recording-list"
        class="work-list"
      ></div>

      <h3 style="margin-top: 32px;">
        Sparade transkript
      </h3>

      <div
        id="session-list"
        class="work-list"
      ></div>

      <div
        id="previous-status"
        class="metadata"
      ></div>
    </div>
  </section>

  <section
    id="view-transcript"
    class="app-view"
    hidden
  >
    <button
      class="back-button"
      data-back-home
      type="button"
    >
      ← Till startsidan
    </button>

    <div class="panel">
      <h2>Transkript</h2>

      <div id="status">
        Transkriptet är klart.
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
  </section>

  <script>
    const startView =
      document.getElementById('view-start');

    const recordView =
      document.getElementById('view-record');

    const importView =
      document.getElementById('view-import');

    const previousView =
      document.getElementById('view-previous');

    const transcriptView =
      document.getElementById('view-transcript');

    const navRecordButton =
      document.getElementById('nav-record');

    const navImportButton =
      document.getElementById('nav-import');

    const navPreviousButton =
      document.getElementById('nav-previous');

    const fileInput =
      document.getElementById('file');

    const transcribeButton =
      document.getElementById('transcribe');

    const saveButton =
      document.getElementById('save');

    const exportButton =
      document.getElementById('export');

    const sessionList =
      document.getElementById('session-list');

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

    const recordingList =
      document.getElementById('recording-list');

    const importStatus =
      document.getElementById('import-status');

    const previousStatus =
      document.getElementById('previous-status');

    const status =
      document.getElementById('status');

    const metadata =
      document.getElementById('metadata');

    const transcript =
      document.getElementById('transcript');

    let currentSessionId = null;
    let currentRecordingId = null;

    function showView(view) {
      startView.hidden = true;
      recordView.hidden = true;
      importView.hidden = true;
      previousView.hidden = true;
      transcriptView.hidden = true;

      view.hidden = false;
    }

    navRecordButton.addEventListener(
      'click',
      () => {
        showView(recordView);
      },
    );

    navImportButton.addEventListener(
      'click',
      () => {
        showView(importView);
      },
    );

    navPreviousButton.addEventListener(
      'click',
      async () => {
        previousStatus.textContent =
          'Läser sparat arbete...';

        showView(previousView);

        await loadRecordings();
        await loadSessions();

        previousStatus.textContent = '';
      },
    );

    for (
      const button of
        document.querySelectorAll(
          '[data-back-home]',
        )
    ) {
      button.addEventListener(
        'click',
        () => {
          showView(startView);
        },
      );
    }

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

          showView(transcriptView);

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
    function openRecording(
      recordingId,
    ) {
      currentRecordingId =
        recordingId;

      showView(recordView);

      recordStatus.classList.remove(
        'error',
      );

      recordStatus.textContent =
        'Sparad inspelning vald. Vad vill du göra?';

      recordMetadata.textContent = '';

      recordActions.hidden = false;

      recordTranscribeButton.disabled = false;
      recordSaveAudioButton.disabled = false;
    }

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

        recordingList.innerHTML = '';

        if (
          result.recordings.length === 0
        ) {
          const empty =
            document.createElement(
              'div',
            );

          empty.className =
            'work-empty';

          empty.textContent =
            'Inga sparade inspelningar väntar på transkribering.';

          recordingList.appendChild(
            empty,
          );

          return;
        }

        for (
          const item of
            result.recordings
        ) {
          const card =
            document.createElement(
              'div',
            );

          card.className =
            'work-card';

          const main =
            document.createElement(
              'div',
            );

          main.className =
            'work-card-main';

          const title =
            document.createElement(
              'div',
            );

          title.className =
            'work-card-title';

          title.textContent =
            item.displayName ||
            'Inspelning';

          const createdAt =
            new Date(
              item.createdAt,
            );

          const date =
            document.createElement(
              'div',
            );

          date.className =
            'work-card-meta';

          date.textContent =
            createdAt.toLocaleString(
              'sv-SE',
              {
                dateStyle: 'medium',
                timeStyle: 'short',
              },
            );

          const sizeMb =
            (
              item.sizeBytes /
              1024 /
              1024
            ).toFixed(1);

          const statusBadge =
            document.createElement(
              'div',
            );

          statusBadge.className =
            'work-card-status';

          statusBadge.textContent =
            'Ej transkriberad · ' +
            sizeMb +
            ' MB';

          main.appendChild(title);
          main.appendChild(date);
          main.appendChild(
            statusBadge,
          );

          const actions =
            document.createElement(
              'div',
            );

          actions.className =
            'work-card-actions';

          const renameButton =
            document.createElement(
              'button',
            );

          renameButton.type =
            'button';

          renameButton.className =
            'secondary-action';

          renameButton.textContent =
            'Byt namn';

          renameButton.addEventListener(
            'click',
            () => {
              if (
                main.querySelector(
                  '.work-name-editor',
                )
              ) {
                return;
              }

              const currentName =
                item.displayName ||
                'Inspelning';

              const editor =
                document.createElement(
                  'div',
                );

              editor.className =
                'work-name-editor';

              const input =
                document.createElement(
                  'input',
                );

              input.type = 'text';
              input.value =
                currentName;

              const saveNameButton =
                document.createElement(
                  'button',
                );

              saveNameButton.type =
                'button';

              saveNameButton.textContent =
                'Spara';

              const cancelButton =
                document.createElement(
                  'button',
                );

              cancelButton.type =
                'button';

              cancelButton.className =
                'secondary-action';

              cancelButton.textContent =
                'Avbryt';

              saveNameButton.addEventListener(
                'click',
                async () => {
                  const trimmedName =
                    input.value.trim();

                  if (!trimmedName) {
                    previousStatus.classList.add(
                      'error',
                    );

                    previousStatus.textContent =
                      'Namnet får inte vara tomt.';

                    return;
                  }

                  try {
                    const response =
                      await fetch(
                        '/api/recording/rename',
                        {
                          method: 'POST',
                          headers: {
                            'Content-Type':
                              'application/json',
                          },
                          body:
                            JSON.stringify({
                              recordingId:
                                item.recordingId,
                              displayName:
                                trimmedName,
                            }),
                        },
                      );

                    const result =
                      await response.json();

                    if (!response.ok) {
                      throw new Error(
                        result.error ??
                          'Inspelningen kunde inte byta namn.',
                      );
                    }

                    previousStatus.classList.remove(
                      'error',
                    );

                    previousStatus.textContent =
                      'Namnet är sparat.';

                    await loadRecordings();
                  } catch (error) {
                    previousStatus.classList.add(
                      'error',
                    );

                    previousStatus.textContent =
                      error instanceof Error
                        ? error.message
                        : 'Inspelningen kunde inte byta namn.';
                  }
                },
              );

              cancelButton.addEventListener(
                'click',
                () => {
                  editor.remove();
                },
              );

              input.addEventListener(
                'keydown',
                (event) => {
                  if (
                    event.key === 'Enter'
                  ) {
                    saveNameButton.click();
                  }

                  if (
                    event.key === 'Escape'
                  ) {
                    editor.remove();
                  }
                },
              );

              editor.appendChild(input);
              editor.appendChild(
                saveNameButton,
              );
              editor.appendChild(
                cancelButton,
              );

              main.appendChild(editor);

              input.focus();
              input.select();
            },
          );
          const openButton =
            document.createElement(
              'button',
            );

          openButton.type =
            'button';

          openButton.textContent =
            'Öppna';

          openButton.addEventListener(
            'click',
            () => {
              openRecording(
                item.recordingId,
              );
            },
          );

          actions.appendChild(
            renameButton,
          );

          actions.appendChild(
            openButton,
          );

          card.appendChild(main);
          card.appendChild(
            actions,
          );

          recordingList.appendChild(
            card,
          );
        }
      } catch (error) {
        previousStatus.classList.add(
          'error',
        );

        previousStatus.textContent =
          error instanceof Error
            ? error.message
            : 'Kunde inte läsa sparade inspelningar.';
      }
    }
    async function openTranscript(
      sessionId,
    ) {
      previousStatus.classList.remove(
        'error',
      );

      previousStatus.textContent =
        'Öppnar transkript...';

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
              'Transkriptet kunde inte öppnas.',
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
          result.source ===
          'recording.wav'
            ? 'Inspelning'
            : result.source;

        status.classList.remove(
          'error',
        );

        status.textContent =
          'Sparat transkript öppnat.';

        showView(transcriptView);
      } catch (error) {
        previousStatus.classList.add(
          'error',
        );

        previousStatus.textContent =
          error instanceof Error
            ? error.message
            : 'Transkriptet kunde inte öppnas.';
      }
    }

    async function loadSessions() {
      try {
        const response =
          await fetch(
            '/api/sessions',
          );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ??
              'Kunde inte läsa sparade transkript.',
          );
        }

        sessionList.innerHTML = '';

        if (
          result.sessions.length === 0
        ) {
          const empty =
            document.createElement(
              'div',
            );

          empty.className =
            'work-empty';

          empty.textContent =
            'Inga sparade transkript ännu.';

          sessionList.appendChild(
            empty,
          );

          return;
        }

        for (
          const item of
            result.sessions
        ) {
          const card =
            document.createElement(
              'div',
            );

          card.className =
            'work-card';

          const main =
            document.createElement(
              'div',
            );

          main.className =
            'work-card-main';

          const title =
            document.createElement(
              'div',
            );

          title.className =
            'work-card-title';

          const isRecording =
            item.source ===
            'recording.wav';

          title.textContent =
            item.displayName ||
            (
              isRecording
                ? 'Inspelning'
                : item.source
            );

          const createdAt =
            new Date(
              item.createdAt,
            );

          const date =
            document.createElement(
              'div',
            );

          date.className =
            'work-card-meta';

          date.textContent =
            createdAt.toLocaleString(
              'sv-SE',
              {
                dateStyle: 'medium',
                timeStyle: 'short',
              },
            );

          const statusBadge =
            document.createElement(
              'div',
            );

          statusBadge.className =
            'work-card-status';

          statusBadge.textContent =
            item.hasEdited
              ? 'Sparat transkript · Redigerat'
              : 'Sparat transkript';

          main.appendChild(title);
          main.appendChild(date);
          main.appendChild(
            statusBadge,
          );

          const actions =
            document.createElement(
              'div',
            );

          actions.className =
            'work-card-actions';

          const renameButton =
            document.createElement(
              'button',
            );

          renameButton.type =
            'button';

          renameButton.className =
            'secondary-action';

          renameButton.textContent =
            'Byt namn';

          renameButton.addEventListener(
            'click',
            () => {
              if (
                main.querySelector(
                  '.work-name-editor',
                )
              ) {
                return;
              }

              const currentName =
                item.displayName ||
                (
                  isRecording
                    ? 'Inspelning'
                    : item.source
                );

              const editor =
                document.createElement(
                  'div',
                );

              editor.className =
                'work-name-editor';

              const input =
                document.createElement(
                  'input',
                );

              input.type = 'text';
              input.value =
                currentName;

              const saveNameButton =
                document.createElement(
                  'button',
                );

              saveNameButton.type =
                'button';

              saveNameButton.textContent =
                'Spara';

              const cancelButton =
                document.createElement(
                  'button',
                );

              cancelButton.type =
                'button';

              cancelButton.className =
                'secondary-action';

              cancelButton.textContent =
                'Avbryt';

              saveNameButton.addEventListener(
                'click',
                async () => {
                  const trimmedName =
                    input.value.trim();

                  if (!trimmedName) {
                    previousStatus.classList.add(
                      'error',
                    );

                    previousStatus.textContent =
                      'Namnet får inte vara tomt.';

                    return;
                  }

                  try {
                    const response =
                      await fetch(
                        '/api/session/rename',
                        {
                          method: 'POST',
                          headers: {
                            'Content-Type':
                              'application/json',
                          },
                          body:
                            JSON.stringify({
                              sessionId:
                                item.sessionId,
                              displayName:
                                trimmedName,
                            }),
                        },
                      );

                    const result =
                      await response.json();

                    if (!response.ok) {
                      throw new Error(
                        result.error ??
                          'Transkriptet kunde inte byta namn.',
                      );
                    }

                    previousStatus.classList.remove(
                      'error',
                    );

                    previousStatus.textContent =
                      'Namnet är sparat.';

                    await loadSessions();
                  } catch (error) {
                    previousStatus.classList.add(
                      'error',
                    );

                    previousStatus.textContent =
                      error instanceof Error
                        ? error.message
                        : 'Transkriptet kunde inte byta namn.';
                  }
                },
              );

              cancelButton.addEventListener(
                'click',
                () => {
                  editor.remove();
                },
              );

              input.addEventListener(
                'keydown',
                (event) => {
                  if (
                    event.key === 'Enter'
                  ) {
                    saveNameButton.click();
                  }

                  if (
                    event.key === 'Escape'
                  ) {
                    editor.remove();
                  }
                },
              );

              editor.appendChild(input);
              editor.appendChild(
                saveNameButton,
              );
              editor.appendChild(
                cancelButton,
              );

              main.appendChild(editor);

              input.focus();
              input.select();
            },
          );
          const openButton =
            document.createElement(
              'button',
            );

          openButton.type =
            'button';

          openButton.textContent =
            'Öppna';

          openButton.addEventListener(
            'click',
            () => {
              void openTranscript(
                item.sessionId,
              );
            },
          );

          actions.appendChild(
            renameButton,
          );

          actions.appendChild(
            openButton,
          );

          card.appendChild(main);
          card.appendChild(
            actions,
          );

          sessionList.appendChild(
            card,
          );
        }
      } catch (error) {
        previousStatus.classList.add(
          'error',
        );

        previousStatus.textContent =
          error instanceof Error
            ? error.message
            : 'Kunde inte läsa sparade transkript.';
      }
    }
    void loadRecordings();
    void loadSessions();
    transcribeButton.addEventListener(
      'click',
      async () => {
        const file = fileInput.files[0];

        if (!file) {
          importStatus.textContent =
            'Välj en fil först.';
          return;
        }

        if (
          !['.m4a', '.mp3', '.wav', '.mp4'].some(
            (extension) =>
              file.name.toLowerCase().endsWith(extension),
          )
        ) {
          importStatus.textContent =
            'Stöder M4A, MP3, WAV och MP4.';
          importStatus.classList.add('error');
          return;
        }

        importStatus.classList.remove('error');
        importStatus.textContent =
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
            file.name;

          status.textContent =
            'Transkriberingen är klar. Spara innan export.';

          importStatus.textContent =
            'Transkriberingen är klar.';

          showView(transcriptView);

          await loadSessions();
        } catch (error) {
          importStatus.classList.add('error');

          importStatus.textContent =
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
          importStatus.classList.add('error');

          importStatus.textContent =
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
          importStatus.classList.add('error');

          importStatus.textContent =
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
              displayName:
                recording.displayName,
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

        if (recording.displayName) {
          await renameSession(
            join(
              getSessionsRoot(),
              sessionId,
            ),
            recording.displayName,
          );
        }

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
              displayName:
                reopened.metadata.displayName,
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
      request.method === "POST" &&
      request.url === "/api/recording/rename"
    ) {
      try {
        const body =
          await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null ||
          !("recordingId" in body) ||
          !("displayName" in body) ||
          typeof body.recordingId !== "string" ||
          typeof body.displayName !== "string"
        ) {
          sendJson(
            response,
            400,
            {
              error:
                "Ogiltig namnbytesbegäran.",
            },
          );
          return;
        }

        if (
          basename(body.recordingId) !==
          body.recordingId
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
            body.recordingId,
          );

        const metadata =
          await renameRecording(
            recordingDirectory,
            body.displayName,
          );

        sendJson(
          response,
          200,
          {
            recordingId:
              metadata.recordingId,
            displayName:
              metadata.displayName,
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
                : "Inspelningen kunde inte byta namn.",
          },
        );
      }

      return;
    }

    if (
      request.method === "POST" &&
      request.url === "/api/session/rename"
    ) {
      try {
        const body =
          await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null ||
          !("sessionId" in body) ||
          !("displayName" in body) ||
          typeof body.sessionId !== "string" ||
          typeof body.displayName !== "string"
        ) {
          sendJson(
            response,
            400,
            {
              error:
                "Ogiltig namnbytesbegäran.",
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

        const metadata =
          await renameSession(
            sessionDirectory,
            body.displayName,
          );

        sendJson(
          response,
          200,
          {
            sessionId:
              metadata.sessionId,
            displayName:
              metadata.displayName,
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
                : "Transkriptet kunde inte byta namn.",
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
