const path = require("path");
const { spawnSync } = require("child_process");
const { _electron: electron } = require("playwright");

const cardText = process.argv[2];
const marker = process.argv[3];

if (!cardText || !marker) {
  console.error("Usage: edit-save-session <cardText> <marker>");
  process.exit(1);
}

(async () => {
  const root = path.resolve(__dirname, "..");

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

  console.log("MATCHING CARDS:", await card.count());

  await card
    .getByRole("button", { name: "Öppna" })
    .click();

  const textarea = page.locator("textarea:visible");

  await textarea.waitFor({ state: "visible" });

  await page.waitForFunction(() => {
    const el = document.querySelector("textarea");
    return el && el.value.length > 0;
  });

  const before = await textarea.inputValue();

  if (!before.includes(marker)) {
    await textarea.fill(before + "\n" + marker);
  }

  await page
    .getByRole("button", { name: /Spara ändringar/ })
    .click();

  const after = await textarea.inputValue();

  console.log("MARKER IN UI:", after.includes(marker));

  await app.close();
})();