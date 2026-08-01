# Installer for Kilo — Windows (PowerShell)

param(
  [string]$KiloConfigDir = "$env:USERPROFILE\.config\kilo",
  [string]$SkillsDir = "$env:USERPROFILE\.kilocode\skills",
  [string]$CommandDir = "$env:USERPROFILE\.kilo\command",
  [switch]$MergeConfig
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Write-Host "== Riz Multi-Agent Teams — Kilo installer =="

# 1. Agents -> global config agent dir
$agentDest = Join-Path $KiloConfigDir "agent"
New-Item -ItemType Directory -Force -Path $agentDest | Out-Null
Copy-Item -Path (Join-Path $Root "agents\*.md") -Destination $agentDest -Force
Write-Host "[ok] agents -> $agentDest"

# 2. Skill -> skills dir
$skillDest = Join-Path $SkillsDir "multi-agent-teams"
New-Item -ItemType Directory -Force -Path $skillDest | Out-Null
Copy-Item -Path (Join-Path $Root "skill\multi-agent-teams\SKILL.md") -Destination $skillDest -Force
Write-Host "[ok] skill -> $skillDest"

# 3. Command -> command dir
New-Item -ItemType Directory -Force -Path $CommandDir | Out-Null
Copy-Item -Path (Join-Path $Root "command\multi-agent-teams.md") -Destination $CommandDir -Force
Write-Host "[ok] command -> $CommandDir"

# 4. Optional config merge
if ($MergeConfig) {
  $cfgPath = Join-Path $KiloConfigDir "kilo.jsonc"
  if (Test-Path $cfgPath) {
    Write-Host "[warn] kilo.jsonc exists — merge manually (config/kilo.jsonc) to avoid clobbering."
  } else {
    Copy-Item -Path (Join-Path $Root "config\kilo.jsonc") -Destination $cfgPath -Force
    Write-Host "[ok] fresh config -> $cfgPath"
  }
} else {
  Write-Host "[skip] config merge (use -MergeConfig for a fresh install)"
}

# 5. Verify
Write-Host ""
Write-Host "Verification (run in a terminal):"
Write-Host "  kilo agent list"
Write-Host "  /multi-agent-teams <your goal>"
Write-Host ""
Write-Host "Done. Reload Kilo."
