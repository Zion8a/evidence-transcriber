const fs = require("fs");
const path = require("path");

function appendJsonl(runDir, fileName, entry) {
  const target = path.join(runDir, fileName);

  fs.appendFileSync(
    target,
    JSON.stringify(entry) + "\n",
    "utf8"
  );
}

module.exports = { appendJsonl };