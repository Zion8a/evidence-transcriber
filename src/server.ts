import { createServer } from "node:http";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  transcribeImportedM4a,
} from "./transcription.js";

const host = "127.0.0.1";
const port = 4317;

const html = `<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
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
  </div>

  <script>
    const fileInput =
      document.getElementById('file');

    const transcribeButton =
      document.getElementById('transcribe');

    const status =
      document.getElementById('status');

    const metadata =
      document.getElementById('metadata');

    const transcript =
      document.getElementById('transcript');

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

          transcript.value =
            result.text;

          transcript.disabled = false;

          metadata.textContent =
            'Session: ' +
            result.sessionId +
            ' | Segment: ' +
            result.segmentCount;

          status.textContent =
            'Transkriberingen är klar.';
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
