import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePlaywright, McpServer } from './mcp.js';
import { ensureBoard, readBoard, dashboardHtml, readRunManifest } from './board.js';
import { closeAll } from './tabs.js';
import { createTools, attachConsoleCapture } from './tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.USERPROFILE || process.env.HOME || '.';

const ENV = {
  PROFILE_DIR: process.env.ACX_PROFILE_DIR || path.join(HOME, '.cache', 'kilo', 'agent-company', 'profile'),
  TEAM_DIR: process.env.ACX_TEAM_DIR || path.join(HOME, 'kilo_HQ', '.team'),
  HUB_PORT: parseInt(process.env.ACX_HUB_PORT || '17789', 10),
  HEADED: /^(1|true|yes)$/i.test(process.env.ACX_HEADED || '0'),
  TIMEOUT: parseInt(process.env.ACX_TIMEOUT || '20000', 10),
  TOOL_CAP: Math.min(parseInt(process.env.ACX_TOOL_TIMEOUT || '25000', 10), 28000),
  IDLE_MS: parseInt(process.env.ACX_IDLE_MS || String(30 * 60 * 1000), 10),
  CHANNEL: process.env.ACX_CHANNEL || 'auto',
  VERBOSE: /^(1|true|yes)$/i.test(process.env.ACX_VERBOSE || '0'),
};

const LOCK_FILE = path.join(ENV.PROFILE_DIR, 'hub.lock');

function log(...args) {
  process.stderr.write(`[hub] ${new Date().toISOString()} ${args.join(' ')}\n`);
}

function isProcessAlive(pid) {
  if (!pid || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function acquireLock() {
  try {
    fs.mkdirSync(ENV.PROFILE_DIR, { recursive: true });
    if (fs.existsSync(LOCK_FILE)) {
      const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'), 10);
      if (isProcessAlive(pid)) {
        log(`ERROR: browser profile is locked by another live hub (PID ${pid}). Kill it (Stop-Process -Id ${pid} -Force) or set ACX_PROFILE_DIR to another directory, then retry.`);
        process.exit(2);
      }
      log(`stale lock (PID ${pid}) from a dead hub - taking over`);
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid));
  } catch (err) {
    log(`lock warning: ${err.message}`);
  }
}

function releaseLock() {
  try {
    if (fs.readFileSync(LOCK_FILE, 'utf8').trim() === String(process.pid)) fs.unlinkSync(LOCK_FILE);
  } catch {
    // already gone
  }
}

async function launchBrowser() {
  const { chromium } = resolvePlaywright();
  const opts = {
    headless: !ENV.HEADED,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: 'Asia/Singapore',
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage'],
  };

  const bundledOk = (() => {
    try { return fs.existsSync(chromium.executablePath()); } catch { return false; }
  })();

  const order = [];
  const wanted = (ENV.CHANNEL || 'auto').toLowerCase();
  if (wanted !== 'auto' && wanted !== 'chromium') {
    order.push(wanted);
  } else if (wanted === 'chromium') {
    if (bundledOk) order.push('chromium');
    if (process.platform === 'win32') order.push('msedge', 'chrome');
    else order.push('chrome');
  } else {
    if (bundledOk) order.push('chromium');
    if (process.platform === 'win32') order.push('msedge', 'chrome');
    else order.push('chrome');
  }
  if (bundledOk && !order.includes('chromium')) order.unshift('chromium');

  let lastErr = null;
  for (const ch of order) {
    const candidate = { ...opts };
    if (ch !== 'chromium') candidate.channel = ch;
    else delete candidate.channel;
    try {
      const context = await chromium.launchPersistentContext(ENV.PROFILE_DIR, candidate);
      return { context, browserName: ch === 'chromium' ? 'chromium (bundled)' : `channel:${ch}` };
    } catch (err) {
      lastErr = err;
      log(`launch via "${ch}" failed: ${String(err.message).split('\n')[0]}`);
    }
  }
  throw new Error(`No usable browser. Tried: ${order.join(', ')}. ${lastErr ? lastErr.message.split('\n')[0] : ''}`);
}

function startDashboard(ctx) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${ENV.HUB_PORT}`);
    const route = url.pathname;
    try {
      if (route === '/' || route === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(dashboardHtml(ENV.TEAM_DIR, ctx.boardPath, ctx.screenshotsDir, ENV.HUB_PORT));
        return;
      }
      if (route === '/board.json') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(readBoard(ctx.boardPath)));
        return;
      }
      if (route === '/run.json') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(readRunManifest(ENV.TEAM_DIR)));
        return;
      }
      if (route === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, uptime: process.uptime(), ...ENV }));
        return;
      }
      if (route.startsWith('/screenshots/')) {
        const file = path.basename(route);
        const abs = path.join(ctx.screenshotsDir, file);
        if (fs.existsSync(abs)) {
          res.writeHead(200, { 'Content-Type': 'image/png' });
          fs.createReadStream(abs).pipe(res);
          return;
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`error: ${err.message}`);
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(ENV.HUB_PORT, () => {
      log(`dashboard: http://localhost:${ENV.HUB_PORT}`);
      resolve(server);
    });
  });
}

async function main() {
  log(`profile=${ENV.PROFILE_DIR}`);
  log(`team dir=${ENV.TEAM_DIR}`);
  log(`headed=${ENV.HEADED} channel=${ENV.CHANNEL} timeout=${ENV.TIMEOUT}ms toolCap=${ENV.TOOL_CAP}ms idle=${Math.round(ENV.IDLE_MS / 60000)}min`);

  acquireLock();

  const { boardPath, screenshotsDir } = ensureBoard(ENV.TEAM_DIR);
  const { context, browserName } = await launchBrowser();
  log(`browser launched: ${browserName}, pages: ${context.pages().length}`);

  const ctx = {
    context,
    boardPath,
    screenshotsDir,
    teamDir: ENV.TEAM_DIR,
    timeout: ENV.TIMEOUT,
    toolCap: ENV.TOOL_CAP,
    version: '1.0.0',
    browserName,
    verbose: ENV.VERBOSE,
  };

  attachConsoleCapture(ctx);
  context.on('page', () => attachConsoleCapture(ctx));

  let dashboard;
  try {
    dashboard = await startDashboard(ctx);
  } catch (err) {
    log(`dashboard server could not bind :${ENV.HUB_PORT} (${err.message}). Continuing without it.`);
  }

  const tools = createTools(ctx);
  const server = new McpServer({
    name: 'agent-company-browser-hub',
    version: '1.0.0',
    tools,
    log,
    verbose: ENV.VERBOSE,
    toolTimeout: ENV.TOOL_CAP,
  });

  let closing = false;
  async function shutdown(code) {
    if (closing) return;
    closing = true;
    log('shutting down...');
    await closeAll();
    try {
      await context.close();
    } catch (err) {
      log(`context close: ${err.message}`);
    }
    if (dashboard) dashboard.close();
    releaseLock();
    log('bye');
    process.exit(code);
  }

  context.on('close', () => {
    if (closing) return;
    log('browser process exited unexpectedly');
    releaseLock();
    process.exit(1);
  });

  let lastTouch = Date.now();
  server.onActivity = () => {
    lastTouch = Date.now();
  };
  if (ENV.IDLE_MS > 0) {
    const idleCheckMs = Math.min(30000, Math.max(1000, Math.floor(ENV.IDLE_MS / 2)));
    setInterval(() => {
      if (!closing && Date.now() - lastTouch > ENV.IDLE_MS) {
        log(`idle for ${Math.round(ENV.IDLE_MS / 60000)}min - shutting down to free the browser`);
        shutdown(0);
      }
    }, idleCheckMs);
  }

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  process.on('SIGBREAK', () => shutdown(0));
  process.on('uncaughtException', (err) => {
    log(`uncaught: ${err.stack || err.message}`);
  });
  process.on('unhandledRejection', (err) => {
    log(`unhandled rejection: ${err && err.message}`);
  });

  if (ENV.VERBOSE) log(`tools registered: ${tools.map((t) => t.name).join(', ')}`);
  server.start();
}

main().catch((err) => {
  process.stderr.write(`[hub] FATAL: ${err.stack || err.message}\n`);
  process.exit(1);
});
