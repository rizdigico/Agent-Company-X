# Fork guide: Codex

Codex (OpenAI) uses `AGENTS.md` files with frontmatter for agent/tool configuration, `.codex/` for project config, `~/.codex/prompts/` for slash-like prompts, and skills via `.codex/skills/` or the `skills` field. MCP servers are registered with `codex mcp add`.

## Agents / tool routing

Codex historically uses a single agent with tool gating via `AGENTS.md` frontmatter, and newer versions support subagents. Define the team roles in `AGENTS.md` or `.codex/agents/`:

```markdown
---
name: orchestrator
description: Team lead coordinating worker subagents with full device access
tools: read, edit, bash, glob, grep, web, task, execute, mcp__playwright*
---
<prompt text copied from agents/orchestrator.md>
```

Workers (worker-a..e) get `mode: subagent` where supported, each restricted to its own `mcp__playwright-<id>*` tool prefix and granted `mcp__unlimited-research*`.

## Permissions (no prompts)

In `.codex/config.toml`:

```toml
[permissions]
allow = ["Read", "Edit", "Bash", "Write", "Glob", "Grep", "WebFetch", "Task", "WebSearch", "MCPServer"]
```

Or `codex --permission-mode accept-edits` for the session. Verify no tool is left at `ask`.

## MCP servers

```bash
codex mcp add playwright-a -- npx -y @playwright/mcp --headless --user-data-dir ~/.cache/kilo/playwright-a
codex mcp add playwright-b -- npx -y @playwright/mcp --headless --user-data-dir ~/.cache/kilo/playwright-b
codex mcp add playwright-c -- npx -y @playwright/mcp --headless --user-data-dir ~/.cache/kilo/playwright-c
codex mcp add playwright-d -- npx -y @playwright/mcp --headless --user-data-dir ~/.cache/kilo/playwright-d
codex mcp add playwright-e -- npx -y @playwright/mcp --headless --user-data-dir ~/.cache/kilo/playwright-e
codex mcp add unlimited-research -- python <path>/unlimited-research-engine/engine/mcp_research_server.py
```

## Prompt entry point

`~/.codex/prompts/multi-agent-teams.md`:

```markdown
Load the multi-agent-teams skill, read the protocol, and execute the goal loop to 100% completion.
GOAL: {input}
```

## Skills

Copy `skill/multi-agent-teams/SKILL.md` to `~/.codex/skills/multi-agent-teams/SKILL.md` (or add the path to your skills config).
