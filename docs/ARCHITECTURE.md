# Architecture

## Overview

The Multi-Agent Teams system turns a single goal into a self-running team of subagents that plan, source, research, build, and verify — then deliver only when 100% verified. It is designed to be CLI-agnostic: the *skill* is the brain, the *agents* are the workers, the *protocol* is the communication contract, and per-CLI *configs* adapt it to the host (Kilo today, Codex/Claude Code/OpenCode via forks).

## Components

```
┌─────────────────────────────────────────────────────────────┐
│                      SKILL (the brain)                      │
│   skill/multi-agent-teams/SKILL.md                          │
│   - operating contract (no prompts, no stops, goal-driven)  │
│   - team roster + browser bindings                          │
│   - the 8-step loop (plan→size→dispatch→collect→build→      │
│     verify→fix→deliver)                                     │
└──────────────────────────────┬──────────────────────────────┘
                               │ loads
┌──────────────────────────────▼──────────────────────────────┐
│                   ORCHESTRATOR (primary)                    │
│   agents/orchestrator.md                                    │
│   - plans, assigns, dispatches, collects, verifies, delivers│
│   - keeps worker task_ids (idle agents standby for re-do)   │
└──────────┬──────────┬──────────┬──────────┬──────────┬──────┘
           │          │          │          │          │
     ┌─────▼──┐ ┌─────▼───┐ ┌────▼───┐ ┌────▼───┐ ┌────▼────┐
     │ Agent A│ │ Agent B │ │Agent C │ │Agent D │ │ Agent E │
     │Scout/  │ │Research │ │Builder │ │Builder │ │Verify/  │
     │Source  │ │+Visuals │ │(report)│ │(slides)│ │Veto     │
     │pw-a    │ │pw-b     │ │pw-c    │ │pw-d    │ │pw-e     │
     └───┬────┘ └───┬─────┘ └───┬────┘ └───┬────┘ └────┬────┘
         │          │           │          │           │
         └──────────┴───A2A message board (inbox/outbox)──┘
                        protocol/TEAM_PROTOCOL.md
```

## Data flow

1. **Goal in** → orchestrator loads skill, writes todo list, sizes team.
2. **A + B dispatch** (parallel): A scrapes/sources materials; B researches (unlimited-research) and creates visuals (browser image-gen).
3. **C + D dispatch** (parallel): C builds report, D builds slides, using A+B outputs from the outbox.
4. **E dispatch**: opens deliverables, verifies against the exact goal, returns PASS or defect list (veto).
5. **Fix loop**: orchestrator resumes the responsible agent (via `task_id`) → fix → E re-verifies. Loops until PASS.
6. **Deliver**: orchestrator collects final deliverables, reports to user with full brief.

## Communication (A2A)

No direct agent-to-agent messaging exists in the host CLIs; the orchestrator is the hub. A2A is emulated with a **file message board**:

- `C:\Users\aariz\kilo_HQ\.team\inbox\<agent>-<seq>.md` — directed messages
- `C:\Users\aariz\kilo_HQ\.team\outbox\<agent>-<seq>.md` — results/deliverables
- Header convention: `from` / `to` / `seq` / `status`.
- Workers resume via saved `task_id` instead of respawning (preserves context = the "idle standby" semantics).

## Browser isolation

Six Playwright MCP servers (`playwright`, `playwright-a..e`), each launched with a unique persistent `--user-data-dir` under `~/.cache/kilo/`. The orchestrator enforces per-agent binding by system prompt; no agent ever touches another's server.

## Permissions (zero prompts)

- Every tool allowed via explicit per-key `allow` in `kilo.jsonc` (global `permission` + each `agent.<name>.permission`).
- Rationale: a bare `"*": {"*": "allow"}` wildcard is overridden by built-in deny/ask rules that merge *after* it; explicit keys win. All MCP tool patterns (`playwright-*_*`, `unlimited-research_*`, `agentmemory_*`) are explicitly allowed.
- Verified: `kilo agent list` shows ALL ALLOW for every user-facing agent.

## Reliability properties

- **No single point of failure at runtime**: if a worker fails, the orchestrator retries or resumes it.
- **Verification is mandatory**: Agent E has absolute veto; nothing ships unverified.
- **Deterministic teardown**: Playwright MCP servers are session-scoped; they die with the session (no lingering browser processes).
- **Config drift protection**: install scripts + FORKING checklist keep fork parity.

## Design constraints discovered (Kilo 7.4.x)

- Agent/command markdown files with YAML frontmatter **must be UTF-8 BOM** on Windows (`Set-Content -Encoding UTF8`); BOM-less files fail with `No context found for instance`.
- `mcp:` frontmatter on agents is ignored — browser binding is enforced via system prompt.
- `compaction`/`summary`/`title` are binary-hardcoded system agents; they ignore config and file overrides but are pure-text and never prompt.
- Free-model daily quotas can throttle heavy runs; the system works on any model, but plan token budget for big teams.
