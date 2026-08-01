# Agent-Company-X Protocol

Agent-Company-X is a **configurable multi-agent harness**: one orchestrator leads every
run, one independent verifier holds absolute veto, and everything else (workers, roles,
tools, browser use, flow, models) is configured per run by the orchestrator. All agents
run with full, unrestricted permissions — no permission prompts are ever raised. This
protocol is the binding contract for the single-browser model, tab ownership, A2A
communication through the board, and the verification loop.

## Fixed layers

| Agent | Browser hub agent name | Primary duty |
|---|---|---|
| orchestrator | `orchestrator` | Plan, configure the run, dispatch, collect, assemble, deliver. |
| verifier | `verifier` | Independent veto: opens every deliverable, checks quality + exact goal match, returns PASS or defect list. Different model from the builders. |

## Reference roster (spawn as needed, per run)

| Agent | Browser hub agent name | Typical duty |
|---|---|---|
| worker-a | `worker-a` | Scout/Source: portal login, scraping, materials, scope inspection. |
| worker-b | `worker-b` | Research (`unlimited-research_*`) + visuals (browser image-gen or programmatic assets). |
| worker-c | `worker-c` | Builder: reports/documents (design-studio → native DOCX, or markdown/HTML). |
| worker-d | `worker-d` | Builder: slides/decks (design-studio → native PPTX, or HTML slides). |
| worker-e | `worker-e` | Verification + Testing + Veto (default verifier). |

Extra lanes: worker-f/g/... or a generic `worker` for sub-tasks. **Swarms**: any worker
may spawn sub-subagents via the `task` tool; each sub-subagent uses its own `agent` name
(e.g. `worker-b-scout`, `worker-c-chart`) so tab ownership stays clean. The board and
veto loop work identically at every level.

## The browser hub (one browser, tab ownership, never cross)

There is **one shared browser** — the `browser-hub` MCP server — running a single
persistent profile (`~/.cache/kilo/agent-company/profile`). Logins persist across agents
and across runs.

- Every agent calls browser tools with its own `agent` name and `tabKey`
  (e.g. `browser-hub_tab_new {agent: "worker-a", tabKey: "main", url: "..."}`).
- **Ownership is enforced server-side.** The hub keeps a `Map(agent -> tabs)`; an agent
  referencing another agent's tabKey gets `agent "<x>" does not own tab`. Agents never
  try to reach another agent's tabs — the enforcement is a backstop, not a license.
- First tab of an agent defaults to `tabKey: "main"`; open more with a unique `tabKey`
  and switch with `tab_switch`.
- To read a page, `browser-hub_snapshot` (DOM tree: role/name/state + URL + title).
  Selectors for `click`/`fill`/`type`/`select_option` accept CSS, `text=...`,
  `role=button[name="X"]`, `xpath=...`.
- Screenshots are saved to `<team dir>/screenshots/` and shown on the dashboard.
- The **board is the only shared surface** — by design, it is the A2A channel.
- Outside team runs, one-off browser work may use the plain `playwright_*` server.

## A2A communication (the board)

All inter-agent communication flows through the **shared board** (`<team dir>/board.json`,
rendered live at `http://localhost:17789`):

- `browser-hub_board_post {agent, type, content}` — types:
  - `info` — status/context update
  - `task` — assignment from the orchestrator (with deliverable path + agent name)
  - `result` — "deliverable done" from a worker (with the file path)
  - `artifact` — a file/asset produced (with path + purpose)
  - `veto` — verifier verdict: `PASS` or defect list
  - `error` — blocker report
- `browser-hub_board_read {agent?, type?, since?, limit?}` — any agent can read
  everything; filters keep reads small.
- `browser-hub_run_start {mission, team, models}` — the orchestrator writes the run
  manifest; `browser-hub_run_status` updates it to `done` at close.

### Rules

1. The orchestrator assigns each task via a `task` board post containing the exact
   deliverable path (default under `<team dir>/deliverables/`).
2. The worker does the work, writes the deliverable file, then posts a `result` with the
   path. It never overwrites another agent's deliverable.
3. The orchestrator reads results, verifies the deliverable is real and matches the
   assignment.
4. Follow-ups are routed by resuming the worker's session via its `task_id` (idle agents
   stand by for re-do work until the goal completes).
5. Never write credentials or secrets into board posts or deliverables.

## Verification loop (verifier veto)

1. Orchestrator posts the final deliverables + the exact goal to the verifier.
2. The verifier opens every artifact (report, slides, website, etc.) — browser for
   rendered things, officecli/design-studio for Office files — and checks: content
   correctness, consistency, design flaws, and exact match to the goal.
3. The verifier posts `veto: PASS` or a concrete, actionable defect list.
4. On FAIL: the orchestrator routes each defect to the responsible agent (resume via
   `task_id`), that agent fixes it, and the work re-enters verification. Loop as many
   times as needed.
5. Nothing is delivered to the user until the verifier passes 100%.

## Autonomy

- No permission prompts exist in this configuration. Every agent may run any shell
  command, edit any file, browse freely, and use all MCP tools.
- Agents keep working autonomously; only genuinely ambiguous decisions surface to the
  orchestrator, and the orchestrator only surfaces truly blocking ambiguities to the user
  (with a reasonable default chosen first).

## Free-model default

Free models only, spread across providers (Mistral, Kilo gateway `:free`, OpenCode Zen
`-free`) so no single daily quota exhausts. Concrete assignments and overrides:
`config/MODELS.md`.
