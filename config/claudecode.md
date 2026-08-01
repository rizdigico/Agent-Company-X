# Claude Code — Agent-Company-X setup

## Skills

```bash
mkdir -p ~/.claude/skills/multi-agent-teams
cp skill/multi-agent-teams/SKILL.md ~/.claude/skills/multi-agent-teams/SKILL.md
```

## MCP server (browser hub)

```jsonc
// ~/.claude.json or project .mcp.json
{
  "mcpServers": {
    "browser-hub": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\Users\\aariz\\kilo_HQ\\multi-agent-teams\\server\\browser-hub\\hub.mjs"],
      "env": {
        "ACX_TEAM_DIR": "C:\\Users\\aariz\\kilo_HQ\\.team",
        "ACX_HUB_PORT": "17789"
      }
    }
  }
}
```

## Agents / subagents

Claude Code subagents are markdown with frontmatter under `~/.claude/agents/`:

```markdown
---
name: worker-a
description: Scout/source agent for Agent-Company-X
tools: Read, Write, Edit, Glob, Grep, Bash, WebFetch, Task, MCP__browser-hub__*
model: mistral/ministral-8b-latest
---
<role text>
```

Grant full permissions with `--dangerously-skip-permissions` for autonomous runs, or
`--allowedTools` with the full tool list. Set the free model per subagent.

## Invoking

Run the skill manually and follow Step 0 configuration, or wrap it in a slash command
(`.claude/commands/multi-agent-teams.md`).
