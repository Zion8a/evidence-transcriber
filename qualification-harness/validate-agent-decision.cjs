const fs = require("fs");
const path = require("path");

const decisionFile = process.argv[2];

if (!decisionFile) {
  console.error("Usage: validate-agent-decision <decision.json>");
  process.exit(1);
}

const root = __dirname;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const toolsConfig = readJson(
  path.join(root, "agent-tools.json")
);

const contract = readJson(
  path.join(root, "agent-decision-contract.json")
);

const decision = readJson(
  path.resolve(decisionFile)
);

const errors = [];

for (const field of contract.requiredDecisionFields) {
  if (
    decision[field] === undefined ||
    decision[field] === null ||
    decision[field] === ""
  ) {
    errors.push(`Missing required field: ${field}`);
  }
}

const allowedTools = new Set(
  toolsConfig.tools.map((tool) => tool.name)
);

if (
  decision.nextAction &&
  !allowedTools.has(decision.nextAction)
) {
  errors.push(
    `Unknown or forbidden tool: ${decision.nextAction}`
  );
}

if (
  decision.decisionType &&
  !contract.allowedDecisionTypes.includes(
    decision.decisionType
  )
) {
  errors.push(
    `Forbidden decisionType: ${decision.decisionType}`
  );
}

if (errors.length > 0) {
  console.log("DECISION VALIDATION: FAIL");

  for (const error of errors) {
    console.log("-", error);
  }

  process.exit(1);
}

console.log("DECISION VALIDATION: PASS");
console.log("NEXT ACTION:", decision.nextAction);
console.log("DECISION TYPE:", decision.decisionType);
console.log("RISK:", decision.riskAddressed);
console.log("REASON:", decision.reason);