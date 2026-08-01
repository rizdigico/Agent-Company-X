# Per-Agent Models — Free Pool

Agent-Company-X runs on **free models only by default**. Each agent can run on a
different model; you choose the trade-off: speed (fast cheap models for grunt work),
intelligence (stronger free models for planning/judgment), and quota (spread load across
providers so no single daily free quota runs out).

## How it works

The agent files in `agents/` are Markdown with YAML frontmatter. Add one line:

```yaml
---
description: Team worker Agent B - Research + Visuals
mode: subagent
model: kilo/inclusionai/ling-3.0-flash:free   # <-- per-agent model override
permission:
  "*": allow
---
```

- If `model` is absent, the agent inherits the model of the session/command that spawned
  it (the command takes `--model`, or the CLI's current model).
- Model IDs use Kilo's `provider/model` format. Run `kilo models` to list what your
  providers expose, and check that an ID still exists before relying on it.
- Per-agent overrides work for subagents too: when the orchestrator dispatches a worker,
  Kilo uses that worker's frontmatter `model`.

## The free model pool (verified 2026-08-01)

Three providers, all free tiers, non-overlapping quotas — spread the team across them:

| Provider | Model IDs (free) | Best for |
|---|---|---|
| **Kilo gateway** | `kilo/stepfun/step-3.7-flash:free`, `kilo/inclusionai/ling-3.0-flash:free`, `kilo/cohere/north-mini-code:free`, `kilo/poolside/laguna-s-2.1:free`, `kilo/poolside/laguna-xs-2.1:free`, `kilo/kilo-auto/free`, `kilo/openrouter/free` | General work, fast flash models |
| **OpenCode Zen** | `opencode/deepseek-v4-flash-free`, `opencode/mimo-v2.5-free`, `opencode/ling-3.0-flash-free`, `opencode/north-mini-code-free`, `opencode/laguna-s-2.1-free`, `opencode/nemotron-3-ultra-free` | Strongest free reasoning (deepseek-v4-flash-free), independent verifier (mimo-v2.5) |
| **Mistral** | `mistral/codestral-latest`, `mistral/magistral-small`, `mistral/magistral-medium-latest`, `mistral/ministral-3b-latest`, `mistral/ministral-8b-latest`, `mistral/mistral-nemo`, `mistral/mistral-small-*`, `mistral/mistral-medium-*`, `mistral/mistral-large-*` | Fast, high-quota general work; code (codestral) |

**Avoid NVIDIA NIM** (`kilo/nvidia/*:free`) for team runs — too slow. Everything not in
the pool is paid.

## Default assignments by role (as shipped)

| Agent | Role | Default free model |
|---|---|---|
| orchestrator | Planning, coordination, final judgment | `opencode/deepseek-v4-flash-free` (strongest free) |
| worker-a | Scout / source / scrape (browser-heavy) | `mistral/ministral-8b-latest` |
| worker-b | Research + visuals | `kilo/inclusionai/ling-3.0-flash:free` |
| worker-c | Reports / documents | `kilo/poolside/laguna-s-2.1:free` |
| worker-d | Slides / decks | `mistral/ministral-8b-latest` |
| worker-e | Verification / veto | `opencode/mimo-v2.5-free` (independent family) |
| verifier | Verification / veto (fixed layer) | `opencode/mimo-v2.5-free` |
| worker | Generic swarm worker | `mistral/ministral-8b-latest` |

Independence rule: the verifier should run on a **different model family** from the
builders so its judgment is not correlated with theirs (opencode vs mistral/kilo above).

## Notes

- The model must actually be available in your Kilo config/provider set. A bad ID fails
  at spawn time, not silently. If a pool model disappears from `kilo models`, substitute
  another from the table.
- Free-tier quotas are per-provider/per-day; spreading agents across providers is the
  intended way to avoid exhausting one quota.
- For fork targets (Codex, Claude Code, OpenCode), the mechanism differs per CLI — see
  `FORKING.md` and the per-CLI guides in this directory.
