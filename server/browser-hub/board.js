import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function ensureBoard(teamDir) {
  fs.mkdirSync(teamDir, { recursive: true });
  const screenshotsDir = path.join(teamDir, 'screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });
  const boardPath = path.join(teamDir, 'board.json');
  if (!fs.existsSync(boardPath)) {
    fs.writeFileSync(boardPath, '[]\n', 'utf8');
  }
  return { boardPath, screenshotsDir };
}

export function readBoard(boardPath) {
  try {
    const raw = fs.readFileSync(boardPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBoard(boardPath, entries) {
  const tmp = boardPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, boardPath);
}

export function postToBoard(boardPath, agent, type, content, extra = {}) {
  let entries = readBoard(boardPath);
  const entry = {
    id: crypto.randomUUID().slice(0, 8),
    ts: new Date().toISOString(),
    agent,
    type,
    content: String(content),
    ...extra,
  };
  entries.push(entry);
  if (entries.length > 500) entries = entries.slice(-500);
  writeBoard(boardPath, entries);
  return entry;
}

export function clearBoard(boardPath) {
  writeBoard(boardPath, []);
}

export function filterBoard(boardPath, { agent, type, since, limit } = {}) {
  let entries = readBoard(boardPath);
  if (agent) entries = entries.filter((e) => e.agent === agent);
  if (type) entries = entries.filter((e) => e.type === type);
  if (since) entries = entries.filter((e) => e.ts >= since);
  const n = limit ? parseInt(limit, 10) : 200;
  return entries.slice(-n);
}

export function writeRunManifest(teamDir, manifest) {
  fs.writeFileSync(path.join(teamDir, 'run.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

export function readRunManifest(teamDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(teamDir, 'run.json'), 'utf8'));
  } catch {
    return null;
  }
}

export function dashboardHtml(teamDir, boardPath, screenshotsDir, port) {
  const entries = readBoard(boardPath);
  const screenshots = fs.existsSync(screenshotsDir)
    ? fs.readdirSync(screenshotsDir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().reverse()
    : [];
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
  const rows = entries
    .map((e) => {
      const a = esc(e.agent);
      const t = esc(e.type);
      return `<tr><td class="ts">${esc(e.ts)}</td><td class="agent a-${e.agent.replace(/[^a-zA-Z0-9_-]/g, '')}">${a}</td><td class="type t-${e.type.replace(/[^a-zA-Z0-9_-]/g, '')}">${t}</td><td>${esc(e.content)}</td></tr>`;
    })
    .join('\n');
  const thumbs = screenshots
    .map((f) => `<a href="/screenshots/${f}" target="_blank"><img src="/screenshots/${f}" alt="${f}"></a>`)
    .join('\n');
  const agentStats = {};
  for (const e of entries) agentStats[e.agent] = (agentStats[e.agent] || 0) + 1;
  const stats = Object.entries(agentStats)
    .map(([a, n]) => `<span class="pill">${esc(a)}: ${n}</span>`)
    .join(' ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agent-Company-X - Team Board</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; background: #0f1115; color: #e6e6e6; }
  header { padding: 14px 20px; background: #161a22; border-bottom: 1px solid #262c38; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  header h1 { font-size: 18px; margin: 0; color: #fff; }
  header .sub { color: #8b93a7; font-size: 12px; }
  .pill { background: #1d2430; border: 1px solid #2c3547; border-radius: 999px; padding: 3px 10px; font-size: 12px; color: #aeb7c9; }
  main { padding: 20px; display: grid; gap: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #1e2430; vertical-align: top; }
  th { color: #8b93a7; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .ts { color: #6b7280; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .agent { white-space: nowrap; font-weight: 600; }
  .a-orchestrator { color: #ffd166; }
  .a-verifier { color: #f87171; }
  .type { white-space: nowrap; font-size: 11px; }
  .t-task { color: #93c5fd; } .t-result { color: #86efac; } .t-veto { color: #f87171; }
  .t-info { color: #c4b5fd; } .t-artifact { color: #fcd34d; } .t-error { color: #fca5a5; }
  .shots { display: flex; flex-wrap: wrap; gap: 10px; }
  .shots img { width: 220px; border-radius: 8px; border: 1px solid #262c38; background: #000; }
  .empty { color: #6b7280; font-style: italic; }
  h2 { font-size: 14px; color: #c7cedd; margin: 0 0 8px; }
  .refresh { margin-left: auto; color: #8b93a7; font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>Agent-Company-X</h1>
  <span class="sub">Team board - live A2A communication channel</span>
  <span class="pill">${entries.length} entries</span>
  ${stats}
  <span class="refresh">auto-refresh 3s</span>
</header>
<main>
  <section>
    <h2>Activity</h2>
    ${entries.length ? `<table><thead><tr><th>Time</th><th>Agent</th><th>Type</th><th>Content</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="empty">No board activity yet.</p>'}
  </section>
  <section>
    <h2>Latest Screenshots (${screenshots.length})</h2>
    ${screenshots.length ? `<div class="shots">${thumbs}</div>` : '<p class="empty">No screenshots yet.</p>'}
  </section>
</main>
<script>setInterval(() => location.reload(), 3000);</script>
</body>
</html>`;
}
