#!/usr/bin/env bash
# Installer for Kilo - macOS / Linux
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KILO_CONFIG_DIR="${KILO_CONFIG_DIR:-$HOME/.config/kilo}"
SKILLS_DIR="${SKILLS_DIR:-$HOME/.kilocode/skills}"
COMMAND_DIR="${COMMAND_DIR:-$HOME/.kilo/command}"

echo "== Agent-Company-X - Kilo installer =="

mkdir -p "$KILO_CONFIG_DIR/agent" "$SKILLS_DIR/multi-agent-teams" "$COMMAND_DIR"

cp "$ROOT"/agents/*.md "$KILO_CONFIG_DIR/agent/"
echo "[ok] agents -> $KILO_CONFIG_DIR/agent"

cp "$ROOT/skill/multi-agent-teams/SKILL.md" "$SKILLS_DIR/multi-agent-teams/SKILL.md"
echo "[ok] skill -> $SKILLS_DIR/multi-agent-teams"

cp "$ROOT/command/multi-agent-teams.md" "$COMMAND_DIR/multi-agent-teams.md"
echo "[ok] command -> $COMMAND_DIR"

if [ -f "$ROOT/server/browser-hub/package.json" ]; then
  (cd "$ROOT/server/browser-hub" && npm install --no-fund --no-audit --loglevel=error) || \
    echo "[warn] npm install failed in server/browser-hub - hub resolves playwright-core from @playwright/mcp instead."
  echo "[ok] browser-hub deps installed (playwright-core)"
fi

echo "[note] merge config/kilo.jsonc into your kilo.jsonc manually (single browser-hub MCP server + permissions; remove old playwright-a..e entries)."
echo "Done. Reload Kilo, then: kilo agent list"
