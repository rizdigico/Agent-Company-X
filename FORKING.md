# Forking the Multi-Agent Teams System to Other CLIs

This system is built to be **general**: the skill (`SKILL.md`) is pure markdown and works in any CLI that can load a skill and spawn subagents. Each CLI differs in *config format, permission model, and agent definition*. This guide covers how to port it.

## The universal core (copy as-is)

These pieces are CLI-agnostic — copy them unchanged:

- `skill/multi-agent-teams/SKILL.md` — the brain; loaded by whatever skill mechanism the target CLI has.
- `protocol/TEAM_PROTOCOL.md` — A2A message board contract, browser isolation rules, veto loop.
- The team *concept*: orchestrator + Agent A..E with the role split described in the skill.

## The per-CLI shell (re-implement per CLI)

### 1. Agent definitions

Each CLI defines agents differently:

| CLI | Agent mechanism | Permission model |
|---|---|---|
| Kilo | `~/.config/kilo/agent/<name>.md` (frontmatter + prompt) | `permission:` block in frontmatter or `kilo.jsonc` `agent.<name>.permission`; actions `allow`/`ask`/`deny`; last matching rule wins |
| Claude Code | `~/.claude/agents/<name>.md` + `CLAUDE.md` | `permissions` in settings; CLAUDE.md `# Tools` section per agent |
| Codex | `~/.codex/agents.md` or `AGENTS.md` frontmatter | `tools` allow/deny lists; `permissions` in `config.toml` |
| OpenCode | `opencode.json` `agent.<name>` blocks; `agent/*.md` | `permission` keys `allow`/`ask`/`deny`; last-match-wins |

Copy the *prompt text* from `agents/*.md` (after the `---` frontmatter) into the target CLI's agent format, and set every tool to allow.

### 2. Per-agent browser servers

Each worker needs its own Playwright MCP server with a unique persistent profile. The pattern (Kilo `kilo.jsonc`):

```jsonc
"playwright-a": {
  "type": "local",
  "command": ["npx", "-y", "@playwright/mcp", "--headless", "--user-data-dir", "<CACHE>/playwright-a"],
  "enabled": true
}
```

- Reproduce for `playwright-a` .. `playwright-e` (and bare `playwright` for the orchestrator).
- Map the MCP server to the agent: in Kilo, tools are exposed to all agents and binding is enforced by system prompt; in Claude Code/Codex, restrict MCP tools per agent via their permission config.
- **Windows caveat:** agent/command markdown files with YAML frontmatter must be saved with a **UTF-8 BOM** for Kilo's parser; plain write tools produce BOM-less files that fail with `No context found for instance`. Use `Set-Content -Encoding UTF8` (PowerShell).

### 3. Zero-permission config

The critical trick (Kilo-specific): built-in deny/ask rules merge **after** a bare `"*": { "*": "allow" }` wildcard and win, so you must write **explicit per-key allow** entries for every tool (including MCP `*_*` patterns) in both the global `permission` block and each `agent.<name>.permission` block. See `config/kilo.jsonc`.

For Claude Code: set `"permissions": {"defaultMode": "acceptEdits", "allow": [...]}`. For Codex: `permissions: allow` for all tools. For OpenCode: same explicit-key pattern as Kilo.

### 4. Command entry point

- Kilo: `command/multi-agent-teams.md` in `.kilo/command/` (or `~/.kilo/command/`), filename = command name.
- Claude Code: a slash command via `~/.claude/commands/multi-agent-teams.md`.
- Codex: a prompt alias in `~/.codex/prompts/multi-agent-teams.md`.
- OpenCode: `command/multi-agent-teams.md` in `.opencode/command/`.

### 5. Skills loading

- Kilo: place skill at `~/.kilocode/skills/multi-agent-teams/SKILL.md` (or add the dir to `skills.paths`).
- Claude Code: `~/.claude/skills/multi-agent-teams/SKILL.md`.
- Codex: `~/.codex/skills/` or reference via CLAUDE.md.
- OpenCode: `~/.opencode/skills/multi-agent-teams/SKILL.md` or `skills.paths`.

### 6. Research engine

The `unlimited-research` MCP (`engine/mcp_research_server.py`) is a local Python service (SearXNG + Crawl4AI). Register it as a local MCP server in the target CLI. It has no API keys. See `resources/LINKS.md`.

---

## Checklist for a clean fork

- [ ] Skill loads in the target CLI (`/multi-agent-teams` or skill tool).
- [ ] All 6 agents defined with the target CLI's format, all tools allowed.
- [ ] 6 Playwright MCP servers registered with unique `--user-data-dir`.
- [ ] Worker prompts bind each agent to its own browser server.
- [ ] Message board paths updated to the target machine (`.team/` under the workspace).
- [ ] `kilo agent list` (or equivalent) shows ALL ALLOW for every agent.
- [ ] A live end-to-end run passes the Agent E verification loop.
