# Resources & LINKS — Agent-Company-X

Everything Agent-Company-X builds on, or inspects. Ordered by what we depend on most.

## Core dependencies

- **Kilo CLI** — the agent runtime. Per-agent config, subagent/task tool, skills,
  commands, MCP. https://github.com/Kilo-Org/kilocode / https://kilo.ai
- **Playwright MCP** (`@playwright/mcp`) — the one-off browser MCP we keep for single
  tasks, and the source of the `playwright-core` dependency the browser-hub resolves.
  https://github.com/microsoft/playwright-mcp
- **Playwright** — browser automation engine. `page.accessibility` was removed in recent
  versions; the hub uses an in-page DOM snapshot walker instead.
  https://playwright.dev
- **unlimited-research engine** — local no-API research (SearXNG + Crawl4AI + Scrapling).
  https://github.com/rizdigico/unlimited-research-engine

## Skills used at runtime (orchestrator/verifier)

- **fable-method** / **fable-loop** / **fable-judge** / **fable-domain** — the Fable
  Method loop family (plan, parallel evidence, adversarial judge, domain adapters).
  Installed in `~/.kilocode/skills/`. The skill is model-agnostic; these give the
  orchestrator its operating discipline.
- **multi-agent-teams** — this system's own skill (`skill/multi-agent-teams/SKILL.md`).

## Reference implementations / inspiration

- **ruflo / ruflo-harness** — the reference harness the fixed-layers concept is based on:
  a plan-driven multi-agent runner where the orchestrator and an independent verifier are
  fixed, workers are spawned per run, and swarms scale out.
- **Browser-use / browser-use-agent (Google DeepMind)** — browser agent research that
  informed the "one browser, tab-isolated, persistent logins" approach.
  https://github.com/browser-use/browser-use
- **Microsoft AutoGen / LangGraph** — agent communication patterns; the board-as-bus
  design (message file + dashboard) is our lighter-weight alternative to their
  orchestration runtimes.

## Tools the workers use

- **officecli** — inspect/build Office documents (DOCX/PPTX/XLSX). Skill:
  `~/.agents/skills/officecli/SKILL.md`. CLI repo:
  https://github.com/rizdigico/officecli
- **design-studio** — DOCX/PPTX generation skill used by worker-c/worker-d (if present
  in your skills dir).
- **crawl4ai** / **scrapling** — scraping engines behind unlimited-research.
  https://github.com/unclecode/crawl4ai

## Model pool docs

- **Mistral** free tier: https://mistral.ai
- **Kilo gateway** `:free` models — listed via `kilo models` (OpenRouter/cohere/stepfun/
  inclusionai/poolside upstreams).
- **OpenCode Zen** free models (deepseek-v4-flash-free, mimo-v2.5-free, ...).

## This repo

- Source: https://github.com/rizdigico/Agent-Company-X
- Local workspace: `C:\Users\aariz\kilo_HQ\multi-agent-teams`
