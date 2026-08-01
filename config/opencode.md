# OpenCode — Agent-Company-X setup

## Skills

Copy `skill/multi-agent-teams/SKILL.md` into `.opencode/skills/multi-agent-teams/SKILL.md`.

## MCP server (browser hub)

```jsonc
// .opencode/config.json (opencode.json)
{
  "mcp": {
    "browser-hub": {
      "type": "local",
      "command": ["node", "C:\\Users\\aariz\\kilo_HQ\\multi-agent-teams\\server\\browser-hub\\hub.mjs"],
      "env": {
        "ACX_TEAM_DIR": "C:\\Users\\aariz\\kilo_HQ\\.team",
        "ACX_HUB_PORT": "17789"
      }
    }
  }
}
```

## Agents / subagents

OpenCode agents are markdown with YAML frontmatter under `.opencode/agent/`. Copy the
`agents/*.md` files; the `model:` frontmatter selects the free model. Permissions:

```yaml
permission:
  "*": allow
```

## Notes

- Free model IDs differ (`opencode/deepseek-v4-flash-free`, etc.) — see `config/MODELS.md`.
- `task` tool for subagents; swarms spawn sub-subagents the same way.
- One hub per machine; shared board dir.
