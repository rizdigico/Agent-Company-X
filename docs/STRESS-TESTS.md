# Stress Test Results (2026-08-01)

Four end-to-end stress tests were run against the live `multi-agent-teams` system
(headless `kilo run --command multi-agent-teams ... --agent orchestrator --auto` on
a free model). All passed. Evidence files sit next to this doc.

## ST1 — Full worker dispatch loop — PASS
Goal: research brief with 3 sourced facts, produced by real subagents.
- Orchestrator planned, then dispatched **worker-b** (research) and **worker-e** (verification) via the `task` tool as real subagents; it did not do the research itself.
- worker-b wrote `ST1-brief.md` with 3 facts, each with source name + URL (NEA, CNA, Straits Times), plus a 2-sentence conclusion.
- worker-e verified the file and returned PASS.
- Evidence: `ST1-brief.md` (deliverable content).

## ST2 — Verification veto loop — PASS
Goal: prove Agent E catches defects and the loop fixes + re-verifies.
- Orchestrator wrote a deliberately defective file (1 fact, no source URL).
- Round 1: Agent E returned **status: fail** with a concrete defect list (fact count 1/3, source URLs 0/3) — see `ST2-e-round1-fail.md`.
- Orchestrator fixed the file (added 2 facts with source URLs).
- Round 2: Agent E returned **status: pass** with per-requirement evidence — see `ST2-e-round2-pass.md`.
- Evidence: `ST2-e-round1-fail.md`, `ST2-e-round2-pass.md`.

## ST3 — Parallel dispatch + browser isolation — PASS
Goal: all 5 workers dispatch simultaneously; each uses only its own browser server.
- Orchestrator spawned worker-a..e in a **single parallel batch** (5 simultaneous `task` calls in one message).
- Each worker navigated `https://example.com` using only its dedicated server (`playwright-a_*` .. `playwright-e_*`), read the real page title (`Example Domain`), and reported the exact tool prefix used.
- Orchestrator cross-checked every worker's reported prefix against its binding — **isolation held, no cross-server usage**.
- Evidence: `ST3-isolation-worker-a.md` (representative; all 5 matched).

## ST4 — Native Office deliverable — PASS
Goal: the team produces a real DOCX via design-studio and Agent E verifies its internal structure.
- worker-c read the design-studio SKILL.md + `word_docx.py` template and used python-docx to create `ST4-REPORT.docx` (35,531 bytes: title, styled "Findings" heading, body paragraph).
- worker-e independently opened the file with python-docx (not the generator's own code, avoiding self-verification bias), confirmed all 3 requirements with exact string matches, and returned PASS with zero defects.
- Evidence: `ST4-e-verdict.md`.

## Wiring checks
- `/multi-agent-teams` command resolves to the `orchestrator` agent, loads the skill, reads the protocol, and dispatches real workers on a free model (COMMAND-LOADED verified).
- All 6 team agents registered (`kilo agent list`): orchestrator (primary) + worker-a..e (subagent), all ALL ALLOW.
- Skill-tool gap fixed: only `.kilocode\skills` is skill-tool loadable, so non-registered skills (design-studio, officecli, unlimited-research) are referenced as direct SKILL.md reads in the agent prompts.
