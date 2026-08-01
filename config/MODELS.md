# Per-Agent Models

Each agent in the team can run on a **different model**. You choose the trade-off:
speed (fast cheap models for grunt work), intelligence (strong models for planning
and judgment), and quota (spread load across providers so no single quota runs out).

## How it works

The agent files in `agents/` are Markdown with YAML frontmatter. Add one line:

```yaml
---
description: Team worker Agent B - Research + Visuals
mode: subagent
model: provider/model-id        # <-- per-agent model override
permission:
  "*": allow
---
```

- If `model` is absent, the agent inherits the model of the session/command that
  spawned it (the command takes `--model`, or the CLI's current model).
- Model IDs use Kilo's `provider/model` format (e.g. `kilo/stepfun/step-3.7-flash:free`,
  `anthropic/claude-sonnet`, `openai/gpt-5.6`). Run `kilo models` to list what your
  providers expose.
- Per-agent model overrides work for subagents too: when the orchestrator dispatches
  worker-b, Kilo uses worker-b's frontmatter `model`.

## Recommended assignments by role

| Agent | Role | Suggested model profile |
|---|---|---|
| orchestrator | Planning, coordination, final judgment | Strong reasoning model (best available) |
| worker-a | Scout / source / scrape | Fast, cheap, high quota (bulk work) |
| worker-b | Research + visuals | Good research model; image model for visuals if available |
| worker-c | Reports / documents | Document-capable model |
| worker-d | Slides / decks | Document-capable model |
| worker-e | Verification / veto | Rigorous, independent model — ideally different from the builders |

## Worked example (Kilo)

```yaml
---
description: Team worker Agent B - Research + Visuals
mode: subagent
model: kilo/stepfun/step-3.7-flash:free
permission:
  "*": allow
---
```

Mix providers freely — e.g. orchestrator on a paid frontier model, workers on free
tier models. That both saves quota on the expensive model and keeps grunt work fast.

## Notes

- The model must actually be available in your Kilo config/provider set. A bad ID
  fails at spawn time, not silently.
- Free-tier quotas are per-provider/per-day; spreading agents across providers is the
  intended way to avoid exhausting one quota.
- For fork targets (Codex, Claude Code, OpenCode), the mechanism differs per CLI —
  see `FORKING.md` and the per-CLI guides in this directory.
