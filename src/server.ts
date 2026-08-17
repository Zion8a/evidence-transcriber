import { createServer } from "node:http";
import { createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
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

const host = "127.0.0.1";
const port = 4317;

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
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }

    button {
      padding: 10px 16px;
      font: inherit;
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
    <h2>Transkribera</h2>

    <div class="controls">
      <input
        id="file"
        type="file"
        accept=".m4a,audio/mp4"
      >

      <button
        id="transcribe"
        type="button"
      >
        Transkribera
      </button>
    </div>

    <div id="status">
      Välj en M4A-fil.
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

    const status =
      document.getElementById('status');

    const metadata =
      document.getElementById('metadata');

    const transcript =
      document.getElementById('transcript');

    let currentSessionId = null;

    transcript.addEventListener(
      'input',
      () => {
        if (currentSessionId) {
          exportButton.disabled = true;
        }
      },
    );

    transcribeButton.addEventListener(
      'click',
      async () => {
        const file = fileInput.files[0];

        if (!file) {
          status.textContent =
            'Välj en M4A-fil först.';
          return;
        }

        if (!file.name.toLowerCase().endsWith('.m4a')) {
          status.textContent =
            'Student Alpha stöder just nu endast M4A.';
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
          link.download =
            'evidence-transcript-' +
            currentSessionId +
            '.txt';

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

      if (
        !originalFileName
          .toLowerCase()
          .endsWith(".m4a")
      ) {
        sendJson(
          response,
          400,
          {
            error:
              "Student Alpha stöder just nu endast M4A.",
          },
        );
        return;
      }

      const uploadRoot =
        ".\\local-ui-uploads";

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
            ".\\local-sessions",
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
          ".\\local-sessions",
          sessionId,
        );

      const exportRoot =
        ".\\local-ui-exports";

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

        response.writeHead(
          200,
          {
            "Content-Type":
              "text/plain; charset=utf-8",
            "Content-Disposition":
              `attachment; filename="evidence-transcript-${sessionId}.txt"`,
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
