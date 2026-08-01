#!/usr/bin/env bash
# Installer for Kilo — macOS / Linux
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KILO_CONFIG_DIR="${KILO_CONFIG_DIR:-$HOME/.config/kilo}"
SKILLS_DIR="${SKILLS_DIR:-$HOME/.kilocode/skills}"
COMMAND_DIR="${COMMAND_DIR:-$HOME/.kilo/command}"

echo "== Riz Multi-Agent Teams — Kilo installer =="

mkdir -p "$KILO_CONFIG_DIR/agent" "$SKILLS_DIR/multi-agent-teams" "$COMMAND_DIR"

cp "$ROOT"/agents/*.md "$KILO_CONFIG_DIR/agent/"
echo "[ok] agents -> $KILO_CONFIG_DIR/agent"

cp "$ROOT/skill/multi-agent-teams/SKILL.md" "$SKILLS_DIR/multi-agent-teams/SKILL.md"
echo "[ok] skill -> $SKILLS_DIR/multi-agent-teams"

cp "$ROOT/command/multi-agent-teams.md" "$COMMAND_DIR/multi-agent-teams.md"
echo "[ok] command -> $COMMAND_DIR"

echo "[note] merge config/kilo.jsonc into your kilo.jsonc manually (contains MCP servers + permissions)."
echo "Done. Reload Kilo, then: kilo agent list"
