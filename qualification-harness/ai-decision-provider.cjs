const fs = require("fs");
const path = require("path");

const stateFile = process.argv[2];
const decisionOut = process.argv[3];

if (!stateFile || !decisionOut) {
  console.error(
    "Usage: ai-decision-provider <state.json> <decision-out.json>"
  );
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(
    fs.readFileSync(file, "utf8")
  );
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("AI PROVIDER: OPENAI_API_KEY NOT SET");
    process.exit(2);
  }

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI();

  const mission = readJson(
    path.join(__dirname, "agent-mission.json")
  );

  const tools = readJson(
    path.join(__dirname, "agent-tools.json")
  );

  const contract = readJson(
    path.join(
      __dirname,
      "agent-decision-contract.json"
    )
  );

  const state = readJson(
    path.resolve(stateFile)
  );

  const model =
    process.env.OPENAI_DECISION_MODEL ||
    "gpt-5.6-terra";

  const prompt = `
You are the decision layer of an AI-native software qualification harness.

Your job is to choose exactly ONE next qualification action.

You do not execute tools.
You do not modify product source code.
You do not decide PASS for critical invariants without deterministic oracle evidence.

MISSION:
${JSON.stringify(mission, null, 2)}

AVAILABLE TOOLS:
${JSON.stringify(tools, null, 2)}

DECISION CONTRACT:
${JSON.stringify(contract, null, 2)}

CURRENT RUN STATE:
${JSON.stringify(state, null, 2)}

Rules:
- Choose only a tool listed in AVAILABLE TOOLS.
- Only choose a tool when every field in its "requires" list is available in current state.availableContext.
- Do not invent file paths, hashes, markers, observations or evidence.
- source/original and raw transcript are DIFFERENT provenance layers.
- Never infer source/original preservation from raw transcript immutability.
- Never describe a claim as verified unless a deterministic oracle result in THIS run supports that exact claim.
- Use "agent-selected" when choosing independently from mission, risk and current state.
- Use "adaptive" only when an observation or result from THIS run materially changes the next action.
- Prefer gathering evidence before making conclusions.
- Use "stop" only when sufficient evidence exists or meaningful further verification is unsupported.
- If you choose "stop", your reason must explicitly acknowledge any mission priority that remains NOT VERIFIED because no deterministic evidence exists.
- riskAddressed must name the concrete risk being investigated.
- reason must explain why this is the highest-value next action.

Return ONLY one JSON object.
No markdown.
No code fences.
No explanatory text.

Required shape:
{
  "nextAction": "tool_name",
  "reason": "short evidence-oriented reason",
  "decisionType": "agent-selected or adaptive",
  "riskAddressed": "concrete risk"
}
`.trim();

  const response = await client.responses.create({
    model,
    input: prompt
  });

  const text = response.output_text.trim();

  let decision;

  try {
    decision = JSON.parse(text);
  } catch {
    console.error("AI PROVIDER: INVALID JSON");
    console.error(text);
    process.exit(3);
  }

  fs.writeFileSync(
    path.resolve(decisionOut),
    JSON.stringify(decision, null, 2),
    "utf8"
  );

  const metadataFile =
    path.join(
      path.dirname(path.resolve(decisionOut)),
      "provider-metadata.json"
    );

  fs.writeFileSync(
    metadataFile,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        provider: "OpenAI Responses API",
        model,
        responseId: response.id,
        usage: response.usage || null
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("AI PROVIDER: PASS");
  console.log("MODEL:", model);
  console.log(
    "DECISION:",
    JSON.stringify(decision)
  );
}

main().catch((error) => {
  console.error(
    "AI PROVIDER: FAIL",
    error.message
  );
  process.exit(1);
});