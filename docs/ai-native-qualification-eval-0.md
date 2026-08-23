# AI-Native Qualification Harness — Eval 0

## Status

Design baseline.

Target application:

- Tag: `packaged-baseline-0.1`
- Commit: `f176e78`
- Product: Evidence Transcriber
- Platform: Windows
- Qualification target: packaged desktop application

The target product is treated as fixed during Eval 0.

---

## Research question

Can an AI-based test agent autonomously perform a meaningful part of the qualification work normally carried out by a software tester on a real Windows desktop application?

The experiment focuses on the agent's ability to:

- identify relevant risks
- choose and adapt test actions
- execute tests against the packaged product
- inspect product state and persisted evidence
- distinguish symptoms from underlying failures
- select useful follow-up investigations
- produce traceable qualification evidence

Critical PASS/FAIL decisions must not depend only on an LLM judgement.

---

## Hypothesis

An AI-native qualification agent can autonomously perform a substantial part of regression, exploratory and evidence-gathering work when it is given:

1. a product goal
2. a high-level risk mission
3. controlled execution tools
4. deterministic oracles for critical properties
5. access to the evidence produced by its own tests

The expected advantage over conventional scripted automation is adaptive test selection and investigation.

The expected limitation is that the AI agent must not be treated as the sole test oracle for critical facts.

---

## Non-goal

Eval 0 does not attempt to prove that AI can replace a professional software tester.

It attempts to measure which parts of a tester's qualification workflow can be performed autonomously, which still require deterministic tooling, and where human judgement remains necessary.

---

## Qualification mission

Qualify `packaged-baseline-0.1` for the core Evidence Transcriber workflow.

Prioritise risks related to:

- loss of source material
- loss of transcript edits
- incorrect recording-to-transcript linkage
- corruption of provenance
- restart and recovery
- recording lifecycle
- local transcription
- saved-work discovery
- export
- dependency failure
- unexpected external dependency or network use

---

## Product invariants

Evidence Transcriber uses the provenance chain:

`source/original -> raw transcript -> edited transcript -> later interpretation`

Eval 0 must treat the following as critical invariants.

### Original preservation

A preserved source must remain available after transcription, editing, save and restart.

### Raw transcript immutability

Editing must not modify the raw transcript.

Where possible this should be verified by cryptographic hash before and after editing.

### Edited transcript separation

User edits must be stored separately from the raw transcript.

### Correct provenance linkage

A recorded source must be linked to the transcription session created from that recording.

### Persistence

Saved work must survive a complete application restart.

### Reopen correctness

Reopening a saved transcript must recover the correct transcript and the latest saved edit.

### Export correctness

Export must be produced from the intended saved transcript.

---

## Deterministic oracles

The AI agent may decide what it wants to investigate.

Critical facts must be checked by tools where possible.

Examples:

- process exit/state
- file existence
- file size
- file timestamps
- JSON structure
- IDs and metadata links
- cryptographic hashes
- exact persisted text
- expected AppData paths
- exported file existence/content
- application restart
- dependency availability

A statement such as "the raw transcript appears unchanged" is not sufficient evidence when a file hash can answer the question.

---

## Agent mandate

The agent may:

- launch and close the packaged application
- interact with the application UI
- inspect files created by the application
- inspect metadata and logs
- calculate hashes
- restart the application
- create controlled input material
- perform negative tests
- choose follow-up tests based on observations
- stop a test when sufficient evidence exists
- report uncertainty

The agent must not:

- modify the target product source code during a qualification run
- silently repair a discovered defect
- report PASS without supporting evidence
- invent observations
- alter expected results after seeing the outcome
- treat its own language-model judgement as sufficient proof of a critical invariant

---

## Initial qualification scenarios

Eval 0 will include known core missions but should not be limited to them.

### Golden Scenario A

`record -> stop -> transcribe -> edit -> save -> close -> restart -> reopen -> export`

### Golden Scenario B

`record -> stop -> close -> restart -> locate recording -> transcribe -> save/reopen`

### Provenance challenge

Verify that editing does not alter the preserved source or raw transcript.

### Recovery challenge

Investigate behaviour when a required local dependency or expected persisted artefact is unavailable or invalid.

### Exploratory mission

Given only the qualification mission and observed application state, choose additional experiments intended to reveal data-loss, provenance or recovery defects.

At least one meaningful test in Eval 0 should be selected by the agent rather than explicitly enumerated in advance.

---

## Evidence model

Every meaningful test action should be traceable to evidence.

A qualification run should eventually produce:

- run identifier
- target tag/commit
- agent mission
- actions performed
- observations
- deterministic oracle results
- discovered defects
- screenshots where useful
- relevant logs
- file/hash evidence
- PASS / FAIL / NOT VERIFIED result
- reason for each result

---

## Autonomy measurement

Eval 0 should distinguish between work supplied in advance and work performed autonomously.

Suggested measures:

### Planned autonomy

How many meaningful test decisions were selected by the agent rather than hard-coded?

### Adaptive investigation

Did the agent change its next action because of an unexpected observation?

### Defect investigation quality

Did the agent distinguish a visible symptom from the underlying product state?

### Oracle discipline

What proportion of critical conclusions were backed by deterministic evidence?

### Human intervention

How many times did a human need to tell the agent what action to perform next?

### Coverage achieved

Which identified product risks were actually investigated?

### False confidence

How many PASS conclusions lacked sufficient supporting evidence?

---

## Result vocabulary

Use only:

- `PASS`
- `FAIL`
- `NOT VERIFIED`

`PASS` requires supporting evidence.

`FAIL` requires an observed deviation with supporting evidence.

`NOT VERIFIED` is preferred over guessing.

---

## Eval 0 success criteria

Eval 0 is successful as an experiment if the harness can demonstrate all of the following:

1. run against the real packaged Windows application
2. execute at least one complete end-to-end workflow
3. verify critical persistence/provenance properties using deterministic evidence
4. independently choose at least one meaningful additional investigation
5. adapt at least once to an observed result rather than only execute a fixed script
6. produce a reproducible evidence report
7. clearly identify where human intervention was still required

The product itself does not need to receive only PASS results for Eval 0 to be successful.

Finding a real defect is valid and potentially stronger evidence of the harness capability.

---

## Interpretation rule

The central question after Eval 0 is not:

"Did AI test the application?"

It is:

"Which parts of a software tester's qualification workflow were autonomously performed, with what evidence, reliability and remaining human dependency?"
