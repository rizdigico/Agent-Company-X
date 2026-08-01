# Fork guide: Claude Code

Claude Code supports subagents (`~/.claude/agents/<name>.md`), skills (`~/.claude/skills/<name>/SKILL.md`), slash commands (`~/.claude/commands/<name>.md`), and MCP servers via `claude mcp add`.

## Agents

For each of `orchestrator`, `worker-a` .. `worker-e`, create `~/.claude/agents/<name>.md`:

```markdown
---
name: orchestrator
description: Team lead that coordinates worker subagents with full device access
tools: Read, Edit, Bash, Write, Grep, Glob, Task, WebFetch, WebSearch, TodoWrite
permissions:
  - "Bash(*)": true
  - "Edit(*)": true
  - "Read(*)": true
  - "Write(*)": true
  - "WebFetch(*)": true
  - "Task(*)": true
  - "Playwright*": true
  - "UnlimitedResearch*": true
---
<prompt text copied from agents/orchestrator.md (after the --- frontmatter)>
```

## Permissions (no prompts)

In `~/.claude/settings.json`, enable accept-edits + allow all for the team agents, or use the per-agent `permissions` block above. Verify nothing is left at `ask` for the tools the agents use.

## MCP servers

```bash
claude mcp add playwright-a -- npx -y @playwright/mcp --headless --user-data-dir ~/.cache/kilo/playwright-a
claude mcp add playwright-b -- npx -y @playwright/mcp --headless --user-data-dir ~/.cache/kilo/playwright-b
claude mcp add playwright-c -- npx -y @playwright/mcp --headless --user-data-dir ~/.cache/kilo/playwright-c
claude mcp add playwright-d -- npx -y @playwright/mcp --headless --user-data-dir ~/.cache/kilo/playwright-d
claude mcp add playwright-e -- npx -y @playwright/mcp --headless --user-data-dir ~/.cache/kilo/playwright-e
claude mcp add unlimited-research -- python <path>/unlimited-research-engine/engine/mcp_research_server.py
```

Restrict per-agent access to its own server via the agent's `tools` / permissions list.

## Command

`~/.claude/commands/multi-agent-teams.md`:

```markdown
Load the multi-agent-teams skill, read the protocol, and execute the goal loop to 100% completion.
GOAL: $ARGUMENTS
```

## Skills

Copy `skill/multi-agent-teams/SKILL.md` to `~/.claude/skills/multi-agent-teams/SKILL.md`.
