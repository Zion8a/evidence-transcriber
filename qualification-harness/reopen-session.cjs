const path = require("path");
const { spawnSync } = require("child_process");
const { _electron: electron } = require("playwright");
const { appendJsonl } = require("./evidence.cjs");

const cardText = process.argv[2];
const expectedMarker = process.argv[3];
const runDir = process.argv[4];

if (!cardText || !expectedMarker) {
  console.error("Usage: reopen-session <cardText> <expectedMarker>");
  process.exit(1);
}

(async () => {
  const root = path.resolve(__dirname, "..");

  if (runDir) {
    appendJsonl(runDir, "actions.jsonl", {
      timestamp: new Date().toISOString(),
      decisionType: "predefined",
      action: "reopen-saved-transcript",
      target: cardText,
      reason: "Verify persisted edited transcript after reopen"
    });
  }

  const preflight = spawnSync(
    process.execPath,
    [path.join(__dirname, "preflight.cjs")],
    { cwd: root, stdio: "inherit" }
  );

  if (preflight.status !== 0) process.exit(1);

  const exe = path.join(
    root,
    "release",
    "win-unpacked",
    "Evidence Transcriber.exe"
  );

  const app = await electron.launch({ executablePath: exe });
  const page = await app.firstWindow();

  await page
    .getByRole("button", { name: /Tidigare arbete/ })
    .click();

  const card = page
    .locator(".work-card")
    .filter({ hasText: cardText });

  const cardCount = await card.count();
  console.log("MATCHING CARDS:", cardCount);

  await card
    .getByRole("button", { name: "Öppna" })
    .click();

  const textarea = page.locator("textarea:visible");

  await textarea.waitFor({
    state: "visible",
    timeout: 5000
  });

  await page.waitForFunction(() => {
    const el = document.querySelector("textarea");
    return el && el.value.length > 0;
  });

  const text = await textarea.inputValue();

  const markerFound = text.includes(expectedMarker);

  console.log("MARKER FOUND:", markerFound);
  console.log("TEXT LENGTH:", text.length);

  if (runDir) {
    appendJsonl(runDir, "observations.jsonl", {
      timestamp: new Date().toISOString(),
      observationType: "ui",
      observation: "reopened-transcript",
      cardCount,
      textLength: text.length,
      markerFound
    });

    appendJsonl(runDir, "oracle-results.jsonl", {
      timestamp: new Date().toISOString(),
      oracle: "reopen-persistence",
      result: cardCount === 1 && markerFound ? "PASS" : "FAIL",
      expectedMarker,
      target: cardText
    });
  }

  await app.close();
})();