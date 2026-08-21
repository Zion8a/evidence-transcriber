import {
  app,
  BrowserWindow,
  dialog,
  session,
} from "electron";

import { join } from "node:path";

let mainWindow: BrowserWindow | null = null;

function configureRuntimePaths(): void {
  const userDataRoot =
    app.getPath("userData");


  process.env.EVIDENCE_TRANSCRIBER_SESSIONS_ROOT =
    join(
      userDataRoot,
      "sessions",
    );

  process.env.EVIDENCE_TRANSCRIBER_UPLOAD_ROOT =
    join(
      userDataRoot,
      "temp",
      "uploads",
    );

  process.env.EVIDENCE_TRANSCRIBER_EXPORT_ROOT =
    join(
      userDataRoot,
      "temp",
      "exports",
    );

  if (app.isPackaged) {
    const runtimeRoot =
      join(
        process.resourcesPath,
        "runtime",
      );

    process.env.EVIDENCE_TRANSCRIBER_FFMPEG_PATH =
      join(
        runtimeRoot,
        "ffmpeg.exe",
      );

    process.env.EVIDENCE_TRANSCRIBER_WHISPER_CLI_PATH =
      join(
        runtimeRoot,
        "whisper-cli.exe",
      );

    process.env.EVIDENCE_TRANSCRIBER_WHISPER_MODEL_PATH =
      join(
        runtimeRoot,
        "ggml-medium.bin",
      );
  } else {
    const appRoot =
      app.getAppPath();

    process.env.EVIDENCE_TRANSCRIBER_FFMPEG_PATH =
      "ffmpeg";

    process.env.EVIDENCE_TRANSCRIBER_WHISPER_CLI_PATH =
      join(
        appRoot,
        "spike",
        "whisper.cpp",
        "build-static-release",
        "bin",
        "whisper-cli.exe",
      );

    process.env.EVIDENCE_TRANSCRIBER_WHISPER_MODEL_PATH =
      join(
        appRoot,
        "models",
        "ggml-medium.bin",
      );
  }
}

function configureDownloads(): void {
  session.defaultSession.on(
    "will-download",
    (_event, item) => {
      const defaultFileName =
        item.getFilename();

      const saveDialogOptions = {
        title: "Exportera transkript",
        defaultPath: defaultFileName,
        filters: [
          {
            name: "Textfil",
            extensions: ["txt"],
          },
        ],
      };

      const selectedPath = mainWindow
        ? dialog.showSaveDialogSync(
            mainWindow,
            saveDialogOptions,
          )
        : dialog.showSaveDialogSync(
            saveDialogOptions,
          );

      if (!selectedPath) {
        item.cancel();
        return;
      }

      item.setSavePath(selectedPath);
    },
  );
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 850,
    minWidth: 800,
    minHeight: 650,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(
    "http://127.0.0.1:4317",
  );
}

app.whenReady().then(async () => {
  configureRuntimePaths();

  await import("./server.js");

  configureDownloads();
  createWindow();

  app.on("activate", () => {
    if (
      BrowserWindow.getAllWindows().length === 0
    ) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
