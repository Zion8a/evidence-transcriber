const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { _electron: electron } = require("playwright");

const root = path.resolve(__dirname, "..");
const runDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : null;

function runPreflight() {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, "preflight.cjs")],
    {
      cwd: root,
      encoding: "utf8"
    }
  );

  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");

  if (result.status !== 0) {
    throw new Error("Preflight failed");
  }
}

async function main() {
  runPreflight();

  const exePath = path.join(
    root,
    "release",
    "win-unpacked",
    "Evidence Transcriber.exe"
  );

  if (!fs.existsSync(exePath)) {
    throw new Error(
      `Packaged application not found: ${exePath}`
    );
  }

  const app = await electron.launch({
    executablePath: exePath
  });

  try {
    const page = await app.firstWindow();

    await page
      .getByRole("button", { name: "Tidigare arbete" })
      .click();

    const cards = page.locator(".work-card");
    const count = await cards.count();

    const savedWork = [];

    for (let i = 0; i < count; i += 1) {
      const text = await cards
        .nth(i)
        .innerText();

      savedWork.push({
        index: i + 1,
        text: text
          .replace(/\r/g, "")
          .replace(/\n+/g, " | ")
          .replace(/\s+/g, " ")
          .trim()
      });
    }

    console.log("SAVED WORK COUNT:", count);
    console.log(
      "SAVED WORK JSON:",
      JSON.stringify(savedWork)
    );

    if (runDir) {
      const {
        appendJsonl
      } = require("./evidence.cjs");

      appendJsonl(
        runDir,
        "actions.jsonl",
        {
          timestamp: new Date().toISOString(),
          decisionType: "agent-selected",
          action: "inspect-saved-work",
          reason:
            "Inspect persisted work before selecting further qualification actions."
        }
      );

      appendJsonl(
        runDir,
        "observations.jsonl",
        {
          timestamp: new Date().toISOString(),
          observationType: "ui",
          observation: "saved-work-list",
          count,
          items: savedWork
        }
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(
    "INSPECT SAVED WORK: FAIL",
    error.message
  );
  process.exit(1);
});