# AI-Native Qualification Eval 0 — Final Report

## Status

**PASS — Eval 0 closed**

Eval 0 demonstrated that an AI agent could autonomously plan, execute, adapt and conclude a bounded software qualification mission against the real packaged Windows build of Evidence Transcriber while critical PASS/FAIL conclusions remained controlled by deterministic evidence.

This result does **not** demonstrate that an AI system can replace a software tester. It demonstrates autonomous execution of a bounded, instrumented qualification workflow under explicit tools, safety constraints and deterministic oracles.

---

## Experimental question

Can an AI agent autonomously perform a substantial part of a traditional software tester's regression, exploratory and evidence-gathering workflow against a real packaged application, while avoiding unsupported PASS conclusions?

---

## Product under qualification

Frozen packaged product baseline:

- Tag: `packaged-baseline-0.1`
- Product commit: `f176e78`
- Platform: Windows
- Application: packaged Evidence Transcriber desktop application

The product was kept separate from the qualification harness during Eval 0.

---

## Provenance model under test

Evidence Transcriber preserves distinct provenance layers:

`source/original -> raw transcript -> edited transcript -> AI interpretation`

Eval 0 focused on the first three layers and persisted user work.

Critical qualification claims:

1. Source/original is preserved.
2. Raw transcript remains immutable after editing.
3. Edited transcript remains separate from raw transcript.
4. Edited content persists after application restart/reopen.

---

## Qualification architecture

The qualification system separated:

1. AI reasoning and test selection
2. Controlled action tools
3. Real product/UI execution
4. Observations
5. Deterministic oracles
6. Structured evidence
7. Qualification reporting

Core rule:

> No deterministic evidence -> no PASS.

The AI agent was therefore allowed to choose actions and adapt its plan, but it was not the authority that established critical PASS results.

---

## Agent control boundary

Agent decisions were restricted by a Decision Gateway.

The agent could only select explicitly allowed qualification tools.

Product source-code modification was not allowed.

Decision classifications:

- `agent-selected`
- `adaptive`

The agent could not create arbitrary shell commands or bypass the controlled executor.

---

## Key development checkpoints

### Automated provenance regression

A predefined automated regression first established that the packaged application could be controlled through its real UI and verified using deterministic filesystem/provenance checks.

Verified capabilities included:

- edit/save through packaged UI
- raw transcript SHA-256 comparison
- edited-layer separation
- restart/reopen persistence
- structured run evidence

### Actual AI decision provider

A real model was then connected as the decision layer.

The model received:

- mission
- available tools
- decision contract
- current observations
- deterministic oracle results
- available execution context

The generated decision was subsequently validated by the deterministic Decision Gateway before execution.

### Adaptive qualification

The agent demonstrated adaptive planning when new observations and oracle results changed its next selected action.

Examples included selecting provenance verification only after a pre-edit hash and a completed edited-layer write existed, and selecting restart/reopen after provenance oracles had passed.

---

## False-confidence finding

An early autonomous run exposed an important failure mode.

After raw transcript immutability, edited-layer separation and reopen persistence were verified, the agent's stop reasoning incorrectly implied that source/original preservation was also verified.

At that point there was no deterministic source/original oracle.

The deterministic report layer correctly refused to convert the agent's statement into PASS:

- source/original preservation: `NOT VERIFIED`
- mission result: `NOT VERIFIED`

This demonstrated the value of separating AI reasoning from qualification authority.

The agent contract was then tightened so that:

- source/original and raw transcript are explicitly distinct layers
- raw transcript immutability cannot be used as evidence for source/original preservation
- unsupported claims must remain `NOT VERIFIED`

A subsequent clean autonomous run correctly acknowledged the remaining source/original evidence gap.

---

## Source/original preservation oracle

A deterministic source/original oracle was then added.

For the controlled Eval 0 session, the persisted original was:

`source\recording.wav`

Baseline characteristics:

- Size: `960044` bytes
- SHA-256:
  `f6b7281a2942d95acb940f265ec9394813840908e3198e307f9fced562f2db21`

The preservation oracle verified after the controlled edit:

- source relative path unchanged
- source SHA-256 unchanged
- physical file size unchanged
- metadata size unchanged

All checks passed.

---

## Final autonomous qualification run

Run ID:

`2026-08-24T06-49-32-125Z`

Frozen harness:

- Commit: `be0aa30120167207ce1ee8aada0ae50607c51dbe`
- Tag: `autonomous-qualification-0.2`
- Harness dirty: `false`

Frozen product:

- Commit: `f176e78`
- Tag: `packaged-baseline-0.1`

Autonomous limits:

- Maximum steps: 10
- Human interventions during autonomous run: 0

Agent decisions:

- Agent-selected: 3
- Adaptive: 4
- Total decisions: 7
- Executed actions: 6

The agent independently selected this sequence:

1. `hash_source_original`
2. `hash_raw_transcript`
3. `edit_and_save`
4. `verify_source_preservation`
5. `verify_provenance`
6. `reopen_transcript`
7. `stop`

The first three decisions established the test state.

The final four decisions were adaptive and depended on evidence generated during the current run.

---

## Final deterministic evidence

### Source/original preservation

**PASS**

Source SHA-256 before:

`f6b7281a2942d95acb940f265ec9394813840908e3198e307f9fced562f2db21`

Source SHA-256 after:

`f6b7281a2942d95acb940f265ec9394813840908e3198e307f9fced562f2db21`

Expected size:

`960044`

Actual size:

`960044`

Metadata size:

`960044`

### Raw transcript immutability

**PASS**

SHA-256 before:

`c68054d121971b10d23ee3ef753dd206a1fc5ff4faeeacfadc4e34bfd8f24f51`

SHA-256 after:

`c68054d121971b10d23ee3ef753dd206a1fc5ff4faeeacfadc4e34bfd8f24f51`

### Edited transcript separation

**PASS**

Controlled marker:

`EVAL0-AUTONOMOUS-003`

The marker was persisted in the edited transcript while the raw transcript hash remained unchanged.

### Restart/reopen persistence

**PASS**

After restart/reopen:

- matching saved-work card: 1
- expected marker found: true

---

## Final result

| Claim | Result |
|---|---|
| Source/original preservation | PASS |
| Raw transcript immutability | PASS |
| Edited transcript separation | PASS |
| Restart/reopen persistence | PASS |

**Mission result: PASS**

**Human interventions during autonomous loop: 0**

---

## What Eval 0 demonstrated

Within the bounded Eval 0 mission, the AI agent demonstrated the ability to:

- select qualification actions
- establish required preconditions before destructive/write actions
- interact indirectly with the real packaged Windows application through controlled tools
- consume real UI and product-state observations
- use deterministic oracle results as new evidence
- adapt subsequent test choices
- distinguish source/original from raw transcript provenance
- stop when all defined mission claims had deterministic evidence
- complete the autonomous loop with zero human intervention

The system also demonstrated resistance to AI false confidence because unsupported model claims did not automatically become qualification PASS results.

---

## What Eval 0 did not demonstrate

Eval 0 does not establish:

- replacement of professional software testers
- general autonomous testing ability across arbitrary applications
- broad exploratory testing competence
- correctness of arbitrary AI-generated test ideas
- defect-finding performance across many seeded faults
- reliability across multiple models or repeated stochastic runs
- native Windows-dialog automation
- complete Evidence Transcriber product qualification
- performance, accessibility, security or usability qualification
- autonomous diagnosis or remediation of arbitrary defects
- statistical evidence of reliability

The experiment used a deliberately bounded mission and a controlled tool surface.

---

## Limitations

Important limitations include:

- one main application
- one principal controlled qualification session
- small number of autonomous runs
- one decision-provider configuration
- deterministic oracles created specifically for the product's provenance architecture
- human-designed tool contracts and safety rules
- limited negative/failure-path autonomous exploration
- no comparative human tester baseline
- no inter-model comparison
- no repeated-run statistical analysis

---

## Eval 0 conclusion

Eval 0 supports the following bounded conclusion:

> An AI agent can autonomously plan, execute and adapt a meaningful provenance-focused qualification workflow against the real packaged Evidence Transcriber Windows application when its actions are constrained by a controlled tool layer and critical conclusions are governed by deterministic evidence.

The strongest architectural finding is not simply that the AI agent could select and execute tests.

It is that **AI reasoning and deterministic qualification authority should remain separate**.

The early false-confidence observation demonstrated why this separation matters.

---

## Recommended next experiment

Eval 1 should focus less on extending the happy-path provenance workflow and more on autonomous risk discovery and failure investigation.

Candidate areas:

- seeded persistence defect
- missing or corrupted session metadata
- missing source file
- corrupted raw transcript
- missing FFmpeg
- missing Whisper executable/model
- invalid media input
- interrupted application/restart workflow
- double-start/port collision
- false-confidence measurement under failing or ambiguous evidence

The next evaluation should measure whether the agent can:

1. detect a failure,
2. avoid false PASS,
3. select a useful investigation,
4. distinguish product failure from environment/harness failure,
5. gather sufficient evidence,
6. report uncertainty correctly.

---

## Closure

**AI-Native Qualification Eval 0: CLOSED — PASS**

Final technical qualification tag:

`autonomous-qualification-0.2`