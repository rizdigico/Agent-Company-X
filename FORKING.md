# FORKING — running Agent-Company-X on other CLIs

The skill (`skill/multi-agent-teams/SKILL.md`) is model- and CLI-agnostic: it only needs
a CLI that supports **subagents (task tool)**, **skills**, and an **MCP server** for the
browser hub. Per-CLI config fragments live in `config/`.

## Shared prerequisites

1. Copy the skill into your CLI's skills dir.
2. Install the browser-hub MCP: `node <repo>/server/browser-hub/hub.mjs` (it resolves
   `playwright-core` from `@playwright/mcp`'s node_modules if its own install is missing).
3. Create the agents for your CLI's agent system with `permission: allow` everywhere and
   a free model from `config/MODELS.md`.
4. Route the A2A board: the hub writes to `ACX_TEAM_DIR` (default `~/kilo_HQ/.team`), so
   any CLI sharing that directory shares the board. The dashboard is
   `http://localhost:17789`.

## Kilo (primary)

- Config fragment: `config/kilo.jsonc` (MCP server + permissions).
- Agents: `agents/*.md` → `~/.config/kilo/agent/`.
- Command: `command/multi-agent-teams.md` → `~/.kilo/command/`.
- Installer: `scripts/install.ps1` / `scripts/install.sh`.

## Claude Code

- Skills: `~/.claude/skills/`. Agents/subagents via
  `claude --allowedTools ...` + skills; `task` tool available in Claude Code 2.x+.
- Model: set per subagent via `CLAUDE_MODEL` / `--model`; use free models from the pool.
- Config fragment: `config/claudecode.md`.

## Codex (OpenAI)

- Skills: `.codex/skills/` or via the skills SDK; subagents via the `task` tool.
- Config fragment: `config/codex.md`.

## OpenCode

- Skills: `.opencode/skills/`; agents via `opencode.json`; `task` tool available.
- Config fragment: `config/opencode.md`.

## Common pitfalls when forking

- **Don't run multiple hub instances.** One `hub.mjs` per machine. Point every CLI at the
  same `ACX_TEAM_DIR` and profile dir.
- **Free model availability** differs per CLI provider set. Verify with the CLI's model
  list command; a bad ID fails at spawn time.
- **`page.accessibility` is gone** in modern Playwright — the hub never uses it (DOM
  snapshot walker instead). Don't reintroduce it in forked tooling.
- **Byte-length framing** — any MCP client you write must read Content-Length in bytes
  (`Buffer`), not JS string length.
