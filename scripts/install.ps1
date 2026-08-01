# Installer for Kilo — Windows (PowerShell)

param(
  [string]$KiloConfigDir = "$env:USERPROFILE\.config\kilo",
  [string]$SkillsDir = "$env:USERPROFILE\.kilocode\skills",
  [string]$CommandDir = "$env:USERPROFILE\.kilo\command",
  [switch]$MergeConfig,
  [switch]$SkipHubInstall
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Write-Host "== Agent-Company-X - Kilo installer =="

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

# 4. Browser hub -> server dir is used in-place from the repo (node server\browser-hub\hub.mjs)
if (-not $SkipHubInstall) {
  $hubDir = Join-Path $Root "server\browser-hub"
  if (Test-Path (Join-Path $hubDir "package.json")) {
    Push-Location $hubDir
    npm install --no-fund --no-audit --loglevel=error 2>$null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "[warn] npm install failed in server\browser-hub - the hub will resolve playwright-core from @playwright/mcp's node_modules instead (no install needed)."
    } else {
      Write-Host "[ok] browser-hub deps installed (playwright-core)"
    }
    Pop-Location
  } else {
    Write-Host "[warn] server\browser-hub not found next to the installer - skipping hub deps. Merge config/kilo.jsonc points at the repo path."
  }
}

# 5. Optional config merge
if ($MergeConfig) {
  $cfgPath = Join-Path $KiloConfigDir "kilo.jsonc"
  if (Test-Path $cfgPath) {
    Write-Host "[warn] kilo.jsonc exists - merge config\kilo.jsonc manually (MCP servers + permissions). Existing config keeps playwright-a..e entries that should be removed."
  } else {
    Copy-Item -Path (Join-Path $Root "config\kilo.jsonc") -Destination $cfgPath -Force
    Write-Host "[ok] fresh config -> $cfgPath"
  }
} else {
  Write-Host "[skip] config merge (use -MergeConfig for a fresh install)"
}

# 6. Verify
Write-Host ""
Write-Host "Verification (run in a terminal):"
Write-Host "  kilo agent list"
Write-Host "  /multi-agent-teams <your goal>"
Write-Host ""
Write-Host "Done. Reload Kilo."
