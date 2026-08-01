# Agent-Company-X Browser Hub

The **single shared browser** for the Agent-Company-X team system. One persistent browser,
many agents, isolated tabs, shared board. Fixes the design flaw of the old per-agent
Playwright servers (separate `--user-data-dir` profiles crash against Chromium's
ProcessSingleton lock and lose all logins).

## Why one browser instead of six

- Chromium/Chrome/Edge allow only **one process per user-data-dir** (`ProcessSingleton`
  lock). Six servers each with their own profile work only when their profiles are truly
  independent — but then logins, cookies, and sessions never carry between agents, and
  each server burns a full browser process.
- One persistent browser (profile kept on disk) means **logins persist across agents and
  across runs**, tabs are cheap, and one process serves the whole team.

## How isolation works

Isolation is enforced **server-side**, not by convention:

- Every agent calls tools with its own `agent` name and `tabKey`.
- The hub keeps a `Map(agent -> Map(tabKey -> page))`. An agent can only ever resolve its
  own tabs; referencing another agent's tabKey fails with `agent "<x>" does not own tab`.
- Nothing in the tool surface lets one agent reach another agent's pages. The board is the
  only shared surface (by design — it is the A2A channel).

## Architecture

```
agents (orchestrator, worker-a..e, verifier)       human: http://localhost:17789
        |  MCP stdio (JSON-RPC over stdin/stdout)         |
        v                                                 v
   hub.mjs  <--------------------------------------->  HTTP dashboard
   - launchPersistentContext(PROFILE_DIR)                - board.json (live)
   - tab ownership Map(agent -> tabs)                    - run.json
   - board read/write (board.json)                       - screenshots/
   - screenshot -> .team/screenshots/
```

## Files

| File | Purpose |
|---|---|
| `hub.mjs` | Entry point: env config, browser launch, HTTP dashboard, MCP server, lifecycle |
| `mcp.js` | MCP stdio server (Content-Length JSON-RPC) + `playwright-core` resolution |
| `tools.js` | 25 tool implementations (browser + board) + DOM snapshot engine |
| `tabs.js` | Tab ownership map, per-agent tab lifecycle |
| `board.js` | Board/run-manifest persistence + dashboard HTML |
| `test/client.mjs` | End-to-end MCP smoke test (isolation, board, persistence) |
| `test/debug.mjs` | Minimal raw MCP probe for protocol debugging |

## Environment

| Env | Default | Meaning |
|---|---|---|
| `ACX_PROFILE_DIR` | `~/.cache/kilo/agent-company/profile` | Persistent browser profile (cookies/logins) |
| `ACX_TEAM_DIR` | `~/kilo_HQ/.team` | Board, run manifest, screenshots |
| `ACX_HUB_PORT` | `17789` | Dashboard HTTP port |
| `ACX_HEADED` | `0` | `1` for a visible browser window |
| `ACX_TIMEOUT` | `30000` | Default per-action timeout (ms) |
| `ACX_CHANNEL` | `auto` | `chromium` (bundled), `msedge`, `chrome`, or `auto` |
| `ACX_PW_PATH` | — | Optional node_modules path containing `playwright-core` |

Browser resolution order: bundled chromium if installed → `msedge` → `chrome` (Windows),
or bundled → `chrome` elsewhere. Real installed browsers work without any download and
give the most realistic, persistent sessions.

## Tools (MCP)

All tools accept `agent` (default `main`); browser tools also accept optional `tabKey`
(defaults to the agent's active tab).

- **Tabs:** `tab_new`, `tab_list`, `tab_switch`, `tab_close`
- **Browse:** `navigate`, `snapshot` (DOM tree: role/name/state), `click`, `fill`, `type`,
  `press`, `select_option`, `evaluate`, `wait_for`, `go_back`, `go_forward`, `reload`,
  `current_url`, `screenshot`, `console`
- **Board (A2A):** `board_post`, `board_read`, `board_clear`, `run_start`, `run_status`
- **Meta:** `hub_status`

Selectors in `click`/`fill`/`type`/`select_option` accept any Playwright locator string:
CSS, `text=...`, `role=button[name="X"]`, `xpath=...`.

## Board protocol

- Entries: `{id, ts, agent, type, content}` where type ∈ `info|task|result|artifact|veto|error`.
- Any agent can read all entries; the orchestrator posts tasks, workers post results,
  the verifier posts the veto verdict. The dashboard renders it live.
- `run.json` holds the current mission manifest (`run_start`/`run_status`).

## Dashboard

Open `http://localhost:17789` while a run is active: live board activity, per-agent
message counts, and the latest screenshots. Auto-refreshes every 3s.

## Run the smoke test

```powershell
node server\browser-hub\test\client.mjs
```

Requires `playwright-core` (bundled in `@playwright/mcp`, or `npm install` in this
directory). Passes when: 25 tools register, tab isolation holds, foreign tabKeys are
rejected, board posts/reads/filters work, screenshots land on disk, and the board survives
a hub restart.

## Notes

- The hub is spawned by the MCP client (Kilo) as a stdio server; the HTTP dashboard is a
  side-channel for humans.
- Shutdown closes all pages and the persistent context gracefully (SIGINT/SIGTERM).
- Console errors/warnings from agent tabs are echoed to the hub's stderr (capped).
