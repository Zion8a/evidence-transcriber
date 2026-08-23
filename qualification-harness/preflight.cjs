const { execFileSync } = require("child_process");

function ps(command) {
  return execFileSync(
    "powershell.exe",
    ["-NoProfile", "-Command", command],
    { encoding: "utf8" }
  ).trim();
}

const port = ps('$c=Get-NetTCPConnection -LocalPort 4317 -State Listen -ErrorAction SilentlyContinue; if($c){"BLOCKED"}else{"PASS"}; exit 0');

const processState = ps('$p=Get-Process -Name "Evidence Transcriber" -ErrorAction SilentlyContinue; if($p){"BLOCKED"}else{"PASS"}; exit 0');

console.log("PRECHECK port 4317:", port);
console.log("PRECHECK process:", processState);

process.exitCode =
  port === "PASS" && processState === "PASS" ? 0 : 1;