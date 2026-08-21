import {
  app,
  BrowserWindow,
  dialog,
  session,
} from "electron";

import "./server.js";

let mainWindow: BrowserWindow | null = null;

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

app.whenReady().then(() => {
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

