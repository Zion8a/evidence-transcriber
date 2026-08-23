# AI-Native Qualification Harness — Eval 0 Architecture

## Status

Architecture baseline.

Target product: Evidence Transcriber
Tag: `packaged-baseline-0.1`
Commit: `f176e78`

---

## Architecture principle

Eval 0 separates four responsibilities:

1. AI reasoning
2. execution
3. deterministic verification
4. evidence storage

The AI agent may decide what to investigate.

The AI agent must not be the sole oracle for critical product properties.

---

## High-level architecture

AI TEST AGENT
    |
    v
ACTION TOOL LAYER
    |
    v
PRODUCT + WINDOWS ENVIRONMENT
    |
    v
DETERMINISTIC ORACLE LAYER
    |
    v
EVIDENCE STORE
    |
    v
QUALIFICATION REPORT

---

## AI test agent

The agent is responsible for test reasoning.

Responsibilities:

- interpret the qualification mission
- identify relevant risks
- select test actions
- choose follow-up investigations
- adapt after observations
- identify uncertainty
- correlate symptoms with evidence
- produce test conclusions

The agent must not:

- modify the target application
- alter expected results after execution
- fabricate observations
- use its own confidence as proof
- silently repair discovered failures
- report PASS without supporting evidence

---

## Action tool layer

The action layer performs real operations against the packaged application.

Initial capabilities:

- start the application
- detect the running process
- close the application
- restart the application
- inspect visible UI
- click controls
- enter text
- navigate between application views

Additional capabilities:

- inspect session and recording directories
- read metadata JSON
- read transcript JSON
- inspect exported TXT files
- calculate SHA-256 hashes
- capture screenshots
- preserve logs
- inspect runtime dependencies
- inspect expected AppData paths

---

## Deterministic oracle layer

Critical assertions should be verified by deterministic code where practical.

Initial oracle types:

- file existence
- SHA-256 hash comparison
- JSON provenance linkage
- persisted edited text
- exported TXT content
- process state
- dependency availability

---

## Evidence store

Each qualification run gets its own evidence directory.

Proposed structure:

qualification-runs/
  <run-id>/
    run.json
    actions.jsonl
    observations.jsonl
    oracle-results.jsonl
    screenshots/
    files/
    hashes/
    logs/
    qualification-report.md

---

## Run identity

Every qualification run must record:

- run ID
- timestamp
- target product tag
- target product commit
- harness commit
- qualification mission
- agent identity/model where available
- operating system
- relevant environment information

---

## Decision classification

Each meaningful test decision must be classified as one of:

- predefined
- agent-selected
- adaptive
- human-directed

`predefined` = specified before the run.

`agent-selected` = independently chosen by the agent.

`adaptive` = chosen because of an observation during the run.

`human-directed` = explicitly instructed by a human.

---

## Observation model

Observations must distinguish between:

- UI observation
- product-state observation
- deterministic oracle result

A UI symptom is not automatically proof of product-state failure.

Example:

UI: newest transcript is not visible first.

Product state: session directory exists.

Oracle: saved edit exists and matches expected text.

---

## Human intervention model

Every human intervention during a qualification run must be recorded.

Examples:

- telling the agent what action to perform next
- resolving a blocked Windows dialog
- interpreting an ambiguous result
- repairing the test environment
- selecting a test the agent did not choose itself

Human intervention count is an Eval 0 metric.

---

## Product isolation

The target application is treated as read-only from the harness perspective.

The harness may:

- execute the packaged application
- create normal application data through product behaviour
- inspect generated artefacts

The harness may not:

- edit product source files
- patch the packaged executable
- modify product behaviour during a run
- hide failures by changing the application

---

## Initial autonomous loop

The intended agent loop is:

1. read the qualification mission
2. inspect current product state
3. identify the highest-value unresolved risk
4. select a test action
5. execute the action
6. record the observation
7. invoke a deterministic oracle where applicable
8. update risk understanding
9. choose the next action
10. stop when the mission is sufficiently verified or cannot be verified

A fixed script that only executes predefined steps does not satisfy the autonomy goal.

---

## Safety rule for conclusions

For critical invariants:

`No deterministic evidence -> no PASS`

If evidence is unavailable or ambiguous:

`NOT VERIFIED`

is required.

---

## Eval 0 implementation boundary

Required for Eval 0:

- real packaged application
- process control
- one UI-driving mechanism
- filesystem inspection
- SHA-256 hashing
- JSON inspection
- evidence logging
- run manifest
- at least one deterministic provenance oracle
- at least one agent-selected action
- at least one adaptive decision

Not required for Eval 0:

- distributed agents
- cloud infrastructure
- vector databases
- RAG
- autonomous code repair
- self-healing selectors
- large-scale test generation
- dashboards
- CI integration
- multi-model benchmarking

---

## Architectural success condition

The architecture is successful if the system can answer:

1. What did the agent decide?
2. Why did it decide it?
3. What action actually occurred?
4. What did the product actually do?
5. Which deterministic evidence supports the conclusion?
6. Where did a human intervene?
7. Which behaviour was predefined versus autonomous?
