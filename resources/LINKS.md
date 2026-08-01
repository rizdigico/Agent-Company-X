# Resources & Upstream Repositories

The system is assembled from these upstream resources. Fork/adapt them as needed.

## Playwright MCP (browser automation)

- **Repo:** https://github.com/microsoft/playwright-mcp
- **Package:** `@playwright/mcp` (run via `npx -y @playwright/mcp`)
- **Usage:** local MCP server per worker with `--user-data-dir` for isolated persistent profiles:
  ```
  npx -y @playwright/mcp --headless --user-data-dir <cache>/playwright-<id>
  ```
- **Why forked:** we run six instances (one per agent) with unique persistent profiles to keep each agent's browser state fully isolated.

## Unlimited Research Engine (no-API deep research)

- **Local copy:** `C:\Users\aariz\kilo_HQ\unlimited-research-engine`
- **Repo (upstream):** built from SearXNG meta-search + Crawl4AI + Scrapling (no external API keys).
- **MCP server:** `engine/mcp_research_server.py` — registers `web_research`, `search_urls`, `scrape_url`, `engine_status` tools.
- **Skills:** the `unlimited-research` skill (`~/.agents/skills/unlimited-research/SKILL.md`) documents the workflow.
- **Usage:** register as a local MCP server:
  ```jsonc
  "unlimited-research": {
    "type": "local",
    "command": ["python", "<path>/engine/mcp_research_server.py"],
    "enabled": true
  }
  ```
- **Caveat (verified):** JS-only interactive challenges (turnstile/hCaptcha) surface as clean per-result errors, not crashes.

## Fable Method / Skills (working discipline)

- **Local skills:** `~/.kilocode/skills/fable-{method,loop,judge,domain}/SKILL.md`
- **Method:** Step-by-step loop — classify the ask, define done, gather evidence, decide, act surgically, verify by observation, report outcome-first.
- **Usage:** the orchestrator loads `fable-method` (plan), `fable-loop` (parallel evidence subagents), and applies the `fable-judge` adversarial stance during Agent E verification.
- **Why included:** gives any mid-tier model a frontier-grade working structure; quality lives in the loop, not the model.

## AgentMemory (cross-session memory, optional)

- **Repo:** https://github.com/rohitg00/agentmemory
- **Package:** `@agentmemory/mcp`
- **Usage:** local MCP server; optional. Gives agents durable cross-session memory (L0-L3 pyramid).
- **Environment:** `AGENTMEMORY_URL=http://localhost:3111`.

## Related platforms referenced during design

- AI wait-state ad category index (context for idle-agent economics): https://AIWaitIndex.com/compare

## Security note

None of these require committing secrets. The system handles portal/account logins at runtime via the agents' browsers; no keys are stored in this repo.
