# Multi-Agent Teams Protocol

The team consists of one orchestrator (primary agent) and up to five worker subagents (worker-a through worker-e). All agents run with full, unrestricted permissions — no permission prompts are ever raised. This protocol is the binding contract for A2A communication, browser isolation, and the verification loop.

## Roles

| Agent | Name | Browser server | Primary duty |
|---|---|---|---|
| orchestrator | Boss/Manager | `playwright_*` | Plan, dispatch, collect, verify, deliver. Final authority (with Agent E). |
| worker-a | Agent A (Scout/Source) | `playwright-a_*` | Portal login, scraping, materials, scope inspection. |
| worker-b | Agent B (Research/Visuals) | `playwright-b_*` | Research via `unlimited-research_*`, image generation, downloading visuals. |
| worker-c | Agent C (Builder: report) | `playwright-c_*` | Build reports/documents from gathered materials. |
| worker-d | Agent D (Builder: slides) | `playwright-d_*` | Build slides/decks with the visuals gathered. |
| worker-e | Agent E (Verification/Veto) | `playwright-e_*` | Open deliverables, verify quality vs scope, absolute veto. |

## Browser isolation (non-negotiable)

- Each agent uses ONLY its own browser server. Cross-use collides browser state.
- Agent to server mapping is fixed above. The orchestrator must enforce this in every task assignment.
- Persistent profiles: `C:\Users\aariz\.cache\kilo\playwright-{a,b,c,d,e}`.

## A2A communication (file message board)

Subagents cannot message each other directly. All inter-agent communication flows through the **shared message board on disk**, with the orchestrator as hub:

- Board root: `C:\Users\aariz\kilo_HQ\.team\`
- `inbox/` — directed messages to a specific agent: `inbox/<agent>-<seq>.md`
- `outbox/` — results/deliverables written by workers: `outbox/<agent>-<seq>.md`

### Rules

1. The orchestrator assigns each task with a deliverable path (e.g. `C:\Users\aariz\kilo_HQ\.team\outbox\worker-a-001.md`).
2. The worker does its work, writes its deliverable to that path, and reports completion to the orchestrator.
3. The orchestrator reads the outbox after each worker completes, verifies the deliverable is real and correct.
4. Follow-ups are routed by resuming the worker's session via its `task_id` (idle agents stand by for re-do work until the goal completes).
5. Every message file starts with a header:
   ```
   from: <agent>
   to: <agent|orchestrator>
   seq: <unique-per-agent-integer>
   status: done | in-progress | needs-input
   ```
6. Sequence numbers are unique per agent. Never overwrite an existing file — create a new one.

## Verification loop (Agent E veto)

1. Orchestrator delivers the final artifacts + the exact requirements to Agent E.
2. Agent E opens every artifact (report, slides, etc.) with its browser/vision, scrolls through, and checks: content correctness, consistency, design flaws, word/element overlaps, and exact match to the given scope/requirements.
3. Agent E returns either **PASS** (100%) or a concrete defect list.
4. On FAIL: orchestrator routes each defect to the responsible agent (resume via `task_id`), that agent fixes it, and the work re-enters Agent E verification. Loop as many times as needed.
5. Nothing is delivered to the user until Agent E passes 100%.

## Autonomy

- No permission prompts exist in this configuration. Every agent may run any shell command, edit any file, browse freely, and use all MCP tools.
- Agents keep working autonomously; only genuinely ambiguous decisions surface to the orchestrator, and the orchestrator only surfaces truly blocking ambiguities to the user (with a reasonable default chosen first).
