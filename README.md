# Agent-Company-X System

A general-purpose, model-agnostic **configurable multi-agent harness** for big projects:
research, building, verification, and delivery — fully autonomous, zero permission
prompts, free models only, agent-to-agent (A2A) communication through a shared board,
**one shared browser with per-agent tab isolation**, and an automatic 100% verification
loop with an independent verifier veto.

Invoke it with `/multi-agent-teams <your goal>` in Kilo, or load the `multi-agent-teams`
skill in any skill-capable CLI and follow it.

---

## What it is

You are the **boss**. You type one goal. The system:

1. **Plans** the full project flow (todo list, phases, dependencies).
2. **Configures the team for this run** — it is a harness, not a fixed roster. Only two
   layers are fixed: the **orchestrator** (you-in-the-loop leader) and the independent
   **verifier** (absolute veto). Everything else — how many workers, their roles, tools,
   browser usage, flow, even the models — is decided per run, sized to the goal:
   - Small task → orchestrator alone or 1-2 workers.
   - Big project → full team + **swarms** (workers spawn their own sub-subagents, an
     "army" for very large builds, including full-stack websites).
3. **Dispatches** workers with full permissions and free models, each with its own
   isolated browser tabs:
   - **Agent A** (worker-a) — Scout/Source: logs in, scrapes materials, inspects scope.
   - **Agent B** (worker-b) — Research + Visuals: `unlimited-research` engine + image
     generation via the browser.
   - **Agent C** (worker-c) — Builder: reports/documents.
   - **Agent D** (worker-d) — Builder: slides/decks.
   - **Agent E / verifier** — Verification + Testing + **Veto** (independent model).
4. **Communicates A2A** through a shared **board** (`board.json`, live dashboard at
   `http://localhost:17789`) — no direct messaging needed between subagents; the board is
   the bus and the orchestrator is the hub.
5. **Uses ONE shared browser** (the `browser-hub` MCP server): a single persistent
   Chromium/Edge profile so **logins persist across agents and across runs**. Tab
   ownership is enforced server-side — an agent can never touch another agent's tabs.
6. **Verifies automatically** — the verifier opens the deliverables, inspects quality and
   requirement-match, and has absolute veto. If anything fails, the orchestrator routes
   the fix to the responsible idle agent and re-verifies, looping until **100% pass**.
7. **Delivers** only when the goal is met: final deliverables + a full brief.

It works quietly and autonomously — hours if needed — with no permission prompts and no
mid-way stops.

---

## Requirements

- **Kilo CLI** (7.4.x) or any skill-capable CLI with subagent support (see
  [FORKING.md](FORKING.md) for Codex, Claude Code, OpenCode).
- **Node.js** (for the browser hub; no npx install needed — it resolves `playwright-core`
  from `@playwright/mcp` or its own `node_modules`).
- **A real browser**: Edge or Chrome (auto-detected) — or bundled chromium via
  `npx playwright install chromium`.
- **Python 3** (optional: the `unlimited-research` engine).
- **Free model access** for at least one of: Mistral, Kilo gateway (`:free`), OpenCode
  Zen (`-free`) — see [config/MODELS.md](config/MODELS.md). No paid model is required.

---

## Layout

```
multi-agent-teams/
├── skill/multi-agent-teams/SKILL.md   # The skill (the brain — model-agnostic harness)
├── command/multi-agent-teams.md       # Kilo slash command wrapper
├── agents/                            # Orchestrator + verifier + worker-a..e + generic worker
├── protocol/TEAM_PROTOCOL.md          # Single-browser tab ownership + board + veto loop
├── server/browser-hub/                # The shared browser MCP server (hub.mjs + modules)
│   └── test/client.mjs                #   End-to-end smoke test (isolation, board, persistence)
├── config/                            # Per-CLI configuration fragments
│   ├── kilo.jsonc                     #   Kilo config (MCP servers, permissions)
│   ├── MODELS.md                      #   Free model pool + per-agent assignments
│   ├── codex.md / claudecode.md / opencode.md
├── scripts/install.ps1 / install.sh   # Installers (copies into Kilo)
├── resources/LINKS.md                 # Upstream resources/repos used
├── docs/                              # Architecture and deep-dive docs
└── .team/                             # Runtime: board, run manifest, deliverables (gitignored)
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
4. Merge `config/kilo.jsonc` into your Kilo config — this **replaces the old
   `playwright-a..e` servers with the single `browser-hub` server** (keep plain
   `playwright` for one-off use)
5. (Optional) Install the `unlimited-research` MCP (see [resources/LINKS.md](resources/LINKS.md))
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

## The browser hub — one browser, isolated tabs, persistent logins

The old design ran six Playwright servers with separate profiles. That fails in practice:
Chromium only allows one process per user-data-dir, so per-agent servers can't share a
real browser, and logins never persist across agents.

Agent-Company-X instead runs **one** persistent browser (`browser-hub` MCP):

- All agents share the profile at `~/.cache/kilo/agent-company/profile` — **logins
  persist across agents and across runs**. Log into a portal once; every future run can
  use that session.
- Each agent owns its own tabs (`tabKey`), enforced **server-side**: referencing another
  agent's tabKey returns an ownership error. Never-crossing is guaranteed by the hub, not
  just promised in prompts.
- Agents read pages via `browser-hub_snapshot` (DOM tree: role/name/state + URL/title)
  and act via `click`/`fill`/`type`/`evaluate` with CSS/`text=`/`role=`/`xpath=`
  selectors.
- Screenshots land in `.team/screenshots/` and render live on the dashboard.
- The board is the only shared surface — it *is* the A2A channel by design.

Run the hub's self-test any time:

```powershell
node server\browser-hub\test\client.mjs
```

## Runs in one session — no session explosion

Everything runs **inside the single session you're already in**:

- The `/multi-agent-teams` command does **not** launch new `kilo` processes or sessions.
- Worker agents are **subagents** spawned through the built-in `task` tool.
- Sub-sub-agents (swarms/armies) follow the same rule.
- The board is just files on disk, so coordination needs no extra sessions.

The only thing that ever creates a new session entry is intentionally starting one.

## Free models only

Each agent can run on a **different model**, set in the agent file's frontmatter. The
shipped defaults are all free, spread across three providers so no single daily quota
runs out: orchestrator on `opencode/deepseek-v4-flash-free`, workers on Mistral/Kilo
`:free` flash models, verifier on `opencode/mimo-v2.5-free` (independent family). See
[config/MODELS.md](config/MODELS.md) for the full pool and how to override per run.

---

## How it satisfies your requirements

| Requirement | Mechanism |
|---|---|
| Multi-agent team, each agent full access | `agent` config blocks + `permission` → every rule `allow`; agent files with `"*": allow` |
| No permissions asked, ever | Global + per-agent `allow` for every tool incl. `bash`, `edit`, MCP `*_*` |
| Persistent logins, one real browser | Single `browser-hub` server, one persistent profile; per-agent tab isolation enforced server-side |
| A2A communication | Shared board (`board.json`) + live dashboard; orchestrator hub; resume via `task_id` |
| Configurable harness, not a fixed roster | SKILL's Step 0 configures team size/roles/tools/flow/models per run; swarms allowed |
| Free models only | Default per-agent frontmatter from the free pool (Mistral / Kilo `:free` / OpenCode Zen) |
| Uses fable method/skills | Orchestrator loads `fable-method` for planning, `fable-loop` for parallel dispatch, `fable-judge` stance for verification |
| 100% automatic test & verify loop | Verifier veto loop: fail → route fix → re-verify, until PASS |
| Quiet full autopilot, no mid-way stops | Skill operating contract: never ask, never stop, loop till goal met |
| Browser usage policy | Use when needed; mandatory when explicitly requested; tab ownership server-enforced |
| Packaged, forkable, general | Skill is model/CLI-agnostic; per-CLI configs and guides in `config/`; see `FORKING.md` |

---

## Security

- **No secrets are committed.** Credentials live in your own portal/account logins
  handled at runtime by the agents (they log in via the shared persistent browser). No
  API keys are stored in this repo.
- `.gitignore` excludes `.team/` runtime artifacts, caches, and local config.
- Agents are instructed never to write secrets into deliverables, notes, or board posts.

---

## License

MIT — see [LICENSE](LICENSE).
