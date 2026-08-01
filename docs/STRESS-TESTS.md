# STRESS-TESTS — Agent-Company-X Verification Evidence

This file documents the stress tests run against the system. The old evidence files in
`docs/stress-test-evidence/` cover the pre-hub design (per-agent playwright-a..e isolated
browsers) and are **superseded** by the single-browser hub architecture.

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

### 4. Config/permission audit (planned — before each release)

- All agents resolve to ALL ALLOW (no ask/deny) — verified against the live config.
- `kilo agent list` shows every agent; no orphaned playwright-a..e servers remain in the
  live kilo.jsonc.

## Running the tests

```powershell
# smoke test (fast)
node server\browser-hub\test\client.mjs

# heavy parallel test — launch a real run:
kilo -c "use the multi-agent-teams skill; run goal X with 3 workers + verifier"
```

Any PR that changes hub behavior must re-run the smoke test and note the result here.
