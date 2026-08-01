# Codex (OpenAI) — Agent-Company-X setup

## Skills

Copy `skill/multi-agent-teams/SKILL.md` into the Codex skills directory (`.codex/skills/`
or via the skills SDK).

## MCP server (browser hub)

```json
// .codex/mcp.json or config.toml
{
  "mcpServers": {
    "browser-hub": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/multi-agent-teams/server/browser-hub/hub.mjs"],
      "env": { "ACX_TEAM_DIR": "~/.team", "ACX_HUB_PORT": "17789" }
    }
  }
}
```

## Agents / subagents

Codex supports subagents via the `task` tool with markdown agent definitions. Give each
agent full tools and a free model (see `config/MODELS.md`). Codex permission config:
`.codex/config.toml`:

```toml
[permissions]
default_mode = "always-allow"
```

For sandboxing, use `default_mode = "accept-edits"` + approved commands only during
development; full autonomy requires always-allow.

## Notes

- Verify free model IDs with `codex models` — availability differs from Kilo.
- Keep the single-hub rule: one `hub.mjs` per machine, shared `ACX_TEAM_DIR`.
