# Fork guide: OpenCode

OpenCode uses `opencode.json` (or `.opencode/` directory) for config, `agent/*.md` or `agent.<name>` blocks for agents, `command/*.md` for slash commands, and `skills/<name>/SKILL.md` for skills. Permission model is the same last-match-wins semantics as Kilo.

## Agents

Create `agent/orchestrator.md`, `agent/worker-a.md` .. `agent/worker-e.md` (or `.opencode/agent/`):

```markdown
---
description: <same description as the Kilo version>
mode: primary | subagent
permission:
  bash: allow
  read: allow
  edit: allow
  glob: allow
  grep: allow
  webfetch: allow
  task: allow
  "*": allow
---
<prompt text copied from agents/*.md>
```

`orchestrator.md` uses `mode: primary`; workers use `mode: subagent`.

## Zero-permission config

In `opencode.json`, mirror the Kilo explicit-key pattern — a bare `"*": {"*": "allow"}` is overridden by built-in deny/ask rules that merge after, so write explicit keys:

```jsonc
{
  "permission": {
    "read": "allow", "edit": "allow", "bash": "allow", "task": "allow",
    "webfetch": "allow", "websearch": "allow", "lsp": "allow", "skill": "allow",
    "todowrite": "allow", "todoread": "allow", "external_directory": "allow",
    "playwright_*": "allow", "playwright-a_*": "allow", "playwright-b_*": "allow",
    "playwright-c_*": "allow", "playwright-d_*": "allow", "playwright-e_*": "allow",
    "unlimited-research_*": "allow",
    "*": { "*": "allow" }
  }
}
```

## MCP servers

```jsonc
"mcp": {
  "playwright-a": { "type": "local", "command": ["npx", "-y", "@playwright/mcp", "--headless", "--user-data-dir", "<cache>/playwright-a"], "enabled": true },
  // ... playwright-b, -c, -d, -e
  "unlimited-research": { "type": "local", "command": ["python", "<path>/engine/mcp_research_server.py"], "enabled": true }
}
```

## Command

`command/multi-agent-teams.md`:

```markdown
---
description: Launch the multi-agent teams system on a goal
agent: orchestrator
---
Load the multi-agent-teams skill, read the protocol, execute the goal loop to 100% completion.
GOAL: $ARGUMENTS
```

## Skills

Copy `skill/multi-agent-teams/SKILL.md` to `.opencode/skills/multi-agent-teams/SKILL.md`, or add the dir to `skills.paths`.
