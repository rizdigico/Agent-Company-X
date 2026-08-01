# Architecture — Agent-Company-X

## System overview

```
                        +---------------------+
                        |    YOU (boss)       |
                        | /multi-agent-teams  |
                        +----------+----------+
                                   | goal
                                   v
                        +---------------------+
                        |   ORCHESTRATOR      |  fixed layer (opencode/deepseek-v4-flash-free)
                        |  plan / dispatch /  |
                        |  judge / deliver    |
                        +----------+----------+
                                   | spawns subagents (task tool), reads/writes board
        +--------------+-----------+----------+------------------+
        |              |                      |                  |
        v              v                      v                  v
   +---------+    +---------+            +---------+      +-----------------+
   |worker-a |    |worker-b |            |worker-e |      |  swarms:        |
   | scout   |    | research|            | verifier|      |  worker -> sub- |
   | (browser|    | +visuals|            | (veto,  |      |  subagents      |
   |  heavy) |    |         |            |  fixed) |      |  (worker-a:sub1 |
   +----+----+    +----+----+            +----+----+      |   ...)          |
        |              |                      |           +-----------------+
        |              |                      |
        +--------+-----+----------+-----------+
                 v                v
        +---------------------+  +-----------------------+
        |  SHARED BROWSER     |  |  THE BOARD (A2A bus)  |
        |  browser-hub MCP    |  |  board.json           |
        |  one profile,       |  |  run.json (manifest)  |
        |  per-agent tabs     |  |  dashboard :17789     |
        |  (server-enforced)  |  |  screenshots/         |
        +---------------------+  +-----------------------+
```

Two **fixed layers** (must exist in every run):
1. **Orchestrator** — plans, dispatches, judges, delivers.
2. **Verifier** — independent veto on all deliverables (different model family).

Everything else (workers, tools, browser use, flow, models, swarm size) is **configured
per run** by the orchestrator at Step 0 of the skill.

## Browser hub internals (`server/browser-hub/`)

| Module | Responsibility |
|---|---|
| `hub.mjs` | Entrypoint. Env/config (`ACX_*`), browser selection (bundled → Edge → Chrome), persistent context launch, dashboard HTTP server, MCP stdio lifecycle. |
| `mcp.js` | Hand-rolled MCP stdio server over Content-Length-framed JSON-RPC. Resolves `playwright-core` from its own `node_modules` first, then `@playwright/mcp`'s node_modules, then `ACX_PW_PATH`. |
| `tabs.js` | Ownership registry: `Map<agent, Map<tabKey, Page>>`. `tab_new` binds `agent`; every operation validates ownership server-side and rejects foreign tabKeys. |
| `tools.js` | The 25 tool handlers. DOM snapshot engine (walking roles/names/states — `page.accessibility` was removed in Playwright), navigation, click/fill/type/select/evaluate, screenshots, board ops, run manifest. |
| `board.js` | `board.json` (A2A message bus, last 200), `run.json` (run_start/run_status manifest), screenshots dir, dashboard HTML (auto-refresh 3s, per-agent pills). |
| `test/client.mjs` | End-to-end smoke test — a clean-room MCP client verifying initialize, tool registration, tab isolation, ownership enforcement, board persistence across restart. |

Key invariants:

- **One browser process.** `chromium.launchPersistentContext(PROFILE_DIR)` — Chromium
  allows one process per user-data-dir, so there is exactly one real browser; agents
  share it by tab, never by process.
- **Ownership is server-side.** `tabs.js` enforces it; prompts only document it. A foreign
  tabKey yields `agent "<x>" does not own tab "<key>"`.
- **Byte-correct framing.** The hub writes Content-Length in **bytes**; the smoke-test
  clients read bytes via `Buffer.indexOf(Buffer.from('\r\n\r\n'))` (char-based slicing
  corrupts non-ASCII payloads).
- **Browser fallback chain.** No bundled chromium revision match → `ACX_CHANNEL=msedge` →
  `chrome`; on Windows the hub launches Edge (already installed) or Chrome. The profile
  persists across restarts, so logins survive.
- **Board is the only shared surface.** No direct subagent messaging; the board file is
  the bus and the orchestrator is the hub. This is deliberate — it sidesteps
  session/process explosion and works across any CLI.

## Session model

One user session. Orchestrator + workers + verifier are **subagents** (task tool);
swarms are sub-subagents. No new `kilo` processes, no new sessions, no session
explosion. The board is files on disk, so coordination has no coupling to sessions.

## Data flow

1. Orchestrator reads goal → plans → posts tasks to board → dispatches workers.
2. Workers read their task (board) → use browser-hub (own tabs) + research/build tools →
   post `result` with deliverable path.
3. Orchestrator collects results → passes final deliverables + goal to verifier.
4. Verifier opens each deliverable (browser-hub for rendered things, officecli/design
   studio for native files), posts `veto` PASS or a numbered defect list.
5. On veto: orchestrator routes fix to the responsible idle agent → repeat until PASS.
6. Deliver: final deliverables + full brief.

## Config surface

- `config/kilo.jsonc` — the single `browser-hub` MCP server, permissions (`*: allow`,
  `browser-hub_*: allow`).
- `config/MODELS.md` — free-model pool and per-agent assignments.
- `agents/*.md` — frontmatter `model`, `permission`, role description.

Hub env vars: `ACX_PROFILE_DIR`, `ACX_TEAM_DIR`, `ACX_HUB_PORT` (17789), `ACX_HEADED`,
`ACX_TIMEOUT`, `ACX_CHANNEL` (auto|chromium|msedge|chrome), `ACX_PW_PATH`.
