const path = require("path");
const { spawnSync } = require("child_process");
const { _electron: electron } = require("playwright");

(async () => {
  const preflight = spawnSync(
    process.execPath,
    [path.resolve(__dirname, "preflight.cjs")],
    { stdio: "inherit" }
  );

  if (preflight.status !== 0) {
    console.error("LAUNCH BLOCKED: preflight failed");
    process.exit(1);
  }

  const exe = path.resolve(
    "release/win-unpacked/Evidence Transcriber.exe"
  );

  const app = await electron.launch({ executablePath: exe });
  const window = await app.firstWindow();

  console.log("TITLE:", await window.title());

  await app.close();
})();