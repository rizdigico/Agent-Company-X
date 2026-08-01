# STRESS-TESTS — Agent-Company-X Verification Evidence

This file documents the stress tests run against the system. Evidence files from the
pre-hub design (per-agent playwright servers with separate profiles) were removed when
the single-browser hub architecture replaced them.

## Test suites

### 1. Browser-hub smoke test (passing — 2026-08-01)

`server\browser-hub\test\client.mjs` — a clean-room MCP client (hand-rolled Content-Length
JSON-RPC) that drives the real hub over stdio:

- `initialize` handshake, tool listing = 25 tools registered.
- `tab_new` (agent "worker-a", tabKey "main") → `navigate` (example.com) →
  `snapshot` (URL + title + DOM tree) → `evaluate` → `screenshot` (file written).
- Second agent `tab_new` → isolated: worker-a's tabs unaffected.
- **Ownership enforcement**: worker-b touching worker-a's tabKey → rejected with
  `agent "worker-b" does not own tab "main"`.
- `board_post` / `board_read` round-trip.
- `run_start` → run.json manifest written.
- **Persistence**: hub restarted → board.json reloaded, tabs/browser relaunched cleanly.

Bugs found and fixed by this test: (1) test clients measured Content-Length in chars
instead of bytes (hub was correct; clients fixed to byte-aware reads); (2) `page.accessibility`
removed in Playwright → replaced with an in-page DOM snapshot walker; (3) non-ASCII
em-dashes in tool descriptions broke char-counting clients (removed); (4) dead `openTab`
helper deleted.

### 2. Heavy parallel test (passing — 2026-08-01)

`server\browser-hub\test\heavy.mjs` — a protocol-level full mini-loop over ONE hub
process with concurrent clients:

- `run_start` mission manifest.
- **Parallel navigation storm**: worker-a / worker-b / verifier open their own tabs to
  example.com / example.org / example.net concurrently; each agent's URL stays its own.
- **Ownership enforcement under load**: foreign tabKey rejected; owner's tab unaffected.
- **The veto loop end-to-end**: orchestrator posts a task → worker-a posts a deliverable
  (report.html with a deliberately wrong value) → verifier opens the deliverable via its
  own tab, reads it, posts `veto` with a concrete defect → orchestrator routes the fix to
  worker-b → worker-b fixes the file → verifier re-reads, sees the fix, posts `PASS`.
- **Parallel board traffic** from all agents lands; run_status and hub_status report all
  working agents.

Run: `node server\browser-hub\test\heavy.mjs`

### 3. Live-install check (passing — 2026-08-01)

`server\browser-hub\test\live-check.mjs --real` spawns the hub with the **exact**
environment the installed `kilo.jsonc` uses (real persistent profile dir, `.team` team
dir, port 17789, headed off) and verifies initialize, hub_status, and 25 registered tools.
Proves the live install boots cleanly on this machine.

Run: `node server\browser-hub\test\live-check.mjs [--real]`

### 4. Slow-page + parallel-load stress (passing — 2026-08-01)

`server\browser-hub\test\slow-load.mjs` proves no tool call can exceed the client's 30s
cap, even under slow or hanging pages. Uses a local throttled HTTP server (8s-delay
route, never-responding route) and `ACX_TIMEOUT=15000` / `ACX_TOOL_TIMEOUT=20000`:

- **Parallel `tab_new` to a slow page (8s delay), 3 agents at once** — completes at the
  goto bound (15.2s), no client timeout.
- **`tab_new` to a hanging page** — returns partial state with
  `warning: initial goto timed out after 15000ms; page may still be loading`, not an
  orphaned 30s hang.
- **`tab_list` with hung titles** — `boundedTitle` caps the title race at 2.5s (7ms
  observed), titles always strings.
- **`evaluate` of a never-resolving async function** — bounded at the goto timeout
  (15s), surfaces `evaluate timed out after 15000ms`.
- **`wait_for` with a 60s requested timeout** — capped at the tool cap (20s), never
  runs the full 60s.
- **8-way parallel mixed storm** (navs, snapshots, board traffic, evaluate) — all 8
  settle in 8.3s; hub stays responsive; board intact.

Result: every observed call stayed under 30s (max 20s). This is the regression guard for
the timeout-bug family that previously caused client-side "Operation timed out after
30000ms" errors.

Run: `node server\browser-hub\test\slow-load.mjs`

### 5. Config/permission audit (verified — 2026-08-01)

- All agents resolve to ALL ALLOW (no ask/deny) — verified against the live config.
- The live config contains exactly four MCP servers: `browser-hub`,
  `unlimited-research`, `agentmemory`, `playwright` — no per-agent playwright servers
  remain in any config, agent file, skill, command, or cache dir.
- No orphaned `playwright-a..e` processes or browser profiles found.

## Running the tests

```powershell
# smoke test (fast)
node server\browser-hub\test\client.mjs

# heavy parallel test — launch a real run:
kilo -c "use the multi-agent-teams skill; run goal X with 3 workers + verifier"
```

Any PR that changes hub behavior must re-run the smoke test and note the result here.
