# Riz Multi-Agent Teams System

A general-purpose, model-agnostic **multi-agent teams system** for big projects: research, building, verification, and delivery — fully autonomous, zero permission prompts, with agent-to-agent (A2A) communication and an automatic 100% verification loop.

Invoke it with `/multi-agent-teams <your goal>` in Kilo, or load the `multi-agent-teams` skill in any skill-capable CLI and follow it.

---

## What it is

You are the **boss**. You type one goal. The system:

1. **Plans** the full project flow (todo list, phases, dependencies).
2. **Sizes the team** to the task — small tasks use the orchestrator alone or 1-2 workers; big projects spin up all 5 workers in parallel.
3. **Dispatches** workers with full permissions, each with its own isolated browser:
   - **Agent A** (worker-a) — Scout/Source: logs in, scrapes materials, inspects scope.
   - **Agent B** (worker-b) — Research + Visuals: `unlimited-research` engine + image generation via browser.
   - **Agent C** (worker-c) — Builder: reports/documents.
   - **Agent D** (worker-d) — Builder: slides/decks.
   - **Agent E** (worker-e) — Verification + Testing + **Veto**.
4. **Communicates A2A** through a file-based message board (`.team/inbox` / `.team/outbox`), orchestrator as hub.
5. **Verifies automatically** — Agent E opens the deliverables, inspects quality and requirement-match, and has absolute veto. If anything fails, the orchestrator routes the fix to the responsible idle agent and re-verifies, looping until **100% pass**.
6. **Delivers** only when the goal is met: final deliverables + a full brief.

It works quietly and autonomously — hours if needed — with no permission prompts and no mid-way stops.

---

## Requirements

- **Kilo CLI** (7.4.x) or any skill-capable CLI with subagent support (see [FORKING.md](FORKING.md) for Codex, Claude Code, OpenCode).
- **Node.js + npx** (for `@playwright/mcp`).
- **Python 3** (for the `unlimited-research` engine).
- Optional: `agentmemory` MCP for cross-session memory.

---

## Layout

```
multi-agent-teams/
├── skill/multi-agent-teams/SKILL.md   # The skill (the brain — model-agnostic)
├── command/multi-agent-teams.md       # Kilo slash command wrapper
├── agents/                            # Orchestrator + worker-a..e agent definitions
├── protocol/TEAM_PROTOCOL.md          # A2A message board + browser isolation + veto loop
├── config/                            # Per-CLI configuration fragments
│   ├── kilo.jsonc                     #   Kilo config (MCP servers, permissions, agents)
│   ├── codex.md                       #   Codex fork guide
│   ├── claudecode.md                  #   Claude Code fork guide
│   └── opencode.md                    #   OpenCode fork guide
├── scripts/install.ps1                # Windows installer (copies into Kilo)
├── scripts/install.sh                 # POSIX installer (copies into Kilo)
├── resources/LINKS.md                 # Upstream resources/repos used
├── docs/                              # Architecture and deep-dive docs
└── .team/                             # Runtime message board (gitignored)
```

---

## Install (Kilo)

```powershell
# From the repo root
.\scripts\install.ps1
```

Or manually:

1. Copy `skill/multi-agent-teams/SKILL.md` → `~/.kilocode/skills/multi-agent-teams/SKILL.md`
2. Copy `agents/*.md` → `~/.config/kilo/agent/`
3. Copy `command/multi-agent-teams.md` → `~/.kilo/command/` (or `.kilo/command/` in your project)
4. Merge `config/kilo.jsonc` into your Kilo config (MCP servers, permissions, agent blocks)
5. Install the `unlimited-research` MCP (see [resources/LINKS.md](resources/LINKS.md))
6. Reload Kilo.

Verify with:

```powershell
kilo agent list          # all agents ALL ALLOW
```

---

## Usage

```
/multi-agent-teams <your exact goal and scope>
```

Example:

```
/multi-agent-teams Full work project: research the topic X, produce a full report
and slides with visuals/images. Scope: ...
```

The system runs to completion autonomously and reports back with deliverables + a full brief.

---

## How it satisfies your requirements

| Requirement | Mechanism |
|---|---|
| Multi-agent team, each agent full access | `agent` config blocks + `permission` → every rule `allow`; agent files with `"*": allow` |
| No permissions asked, ever | Global + per-agent `allow` for every tool incl. `bash`, `edit`, MCP `*_*` |
| Each agent has its own browser | 6 Playwright MCP servers: `playwright`, `playwright-a..e`, each `--user-data-dir` isolated |
| A2A communication | File message board `.team/inbox` + `.team/outbox`; orchestrator hub; resume via `task_id` |
| Uses fable method/skills | Orchestrator loads `fable-method` for planning, `fable-loop` for parallel dispatch, `fable-judge` stance for verification |
| 100% automatic test & verify loop | Agent E veto loop: fail → route fix → re-verify, until PASS |
| Quiet full autopilot, no mid-way stops | Skill operating contract: never ask, never stop, loop till goal met |
| Browser usage policy | Use when needed; mandatory when explicitly requested; per-agent server isolation |
| Packaged, forkable, general | Skill is model/CLI-agnostic; per-CLI configs and guides in `config/`; see `FORKING.md` |

---

## Security

- **No secrets are committed.** Credentials live in your own portal/account logins handled at runtime by the agents (they log in via browser). No API keys are stored in this repo.
- `.gitignore` excludes `.team/` runtime artifacts, caches, and local config.
- Agents are instructed never to write secrets into deliverables.

---

## License

MIT — see [LICENSE](LICENSE).
