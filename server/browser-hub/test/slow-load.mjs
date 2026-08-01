import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HUB = path.join(__dirname, '..', 'hub.mjs');

class McpClient {
  constructor(proc) {
    this.proc = proc;
    this.buf = Buffer.alloc(0);
    this.pending = new Map();
    this.nextId = 1;
    proc.stdout.on('data', (c) => this._onData(Buffer.from(c)));
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', () => {});
  }
  _onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      const headerEnd = this.buf.indexOf(Buffer.from('\r\n\r\n'));
      if (headerEnd === -1) return;
      const header = this.buf.slice(0, headerEnd).toString('utf8');
      const m = /Content-Length:\s*(\d+)/i.exec(header);
      if (!m) { this.buf = this.buf.slice(headerEnd + 4); continue; }
      const len = parseInt(m[1], 10);
      if (this.buf.length < headerEnd + 4 + len) return;
      const body = this.buf.slice(headerEnd + 4, headerEnd + 4 + len).toString('utf8');
      this.buf = this.buf.slice(headerEnd + 4 + len);
      const msg = JSON.parse(body);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        this.pending.get(msg.id).resolve(msg);
        this.pending.delete(msg.id);
      }
    }
  }
  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      this.proc.stdin.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`);
    });
  }
  async call(name, args) {
    const res = await this.request('tools/call', { name, arguments: args });
    if (res.error) throw new Error(`RPC error: ${JSON.stringify(res.error)}`);
    const text = res.result?.content?.[0]?.text || '';
    if (res.result?.isError) throw new Error(`Tool error: ${text}`);
    try { return JSON.parse(text); } catch { return { text }; }
  }
  close() { this.proc.stdin.end(); this.proc.kill(); }
}

let failures = 0;
function check(label, cond, detail = '') {
  const ok = !!cond;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  [${detail}]` : ''}`);
  if (!ok) failures++;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLIENT_CAP_MS = 30000;

async function timed(label, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    const ms = Date.now() - t0;
    check(`${label} < ${CLIENT_CAP_MS}ms`, ms < CLIENT_CAP_MS, `${ms}ms`);
    return { ...r, _ms: ms };
  } catch (e) {
    const ms = Date.now() - t0;
    check(`${label} < ${CLIENT_CAP_MS}ms (errored after ${ms}ms)`, ms < CLIENT_CAP_MS, `${ms}ms :: ${String(e.message).slice(0, 120)}`);
    throw e;
  }
}

function startSlowServer() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/slow') {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><head><title>Slow Page</title></head><body><h1>Slow loaded</h1></body></html>');
      }, 8000);
      return;
    }
    if (u.pathname === '/hanging') {
      // Accept the connection and never respond.
      req.on('close', () => res.destroy());
      return;
    }
    if (u.pathname === '/instant') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><head><title>Instant</title></head><body><p>fast</p></body></html>');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function main() {
  console.log('=== ACX stress: slow/hanging pages + parallel load (cap 30s) ===');
  const server = await startSlowServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const teamDir = path.join(process.env.TEMP || '.', `acx-stress-team-${Date.now()}`);
  const profileDir = path.join(process.env.TEMP || '.', `acx-stress-profile-${Date.now()}`);
  const proc = spawn(process.execPath, [HUB], {
    env: {
      ...process.env,
      ACX_PROFILE_DIR: profileDir,
      ACX_TEAM_DIR: teamDir,
      ACX_HUB_PORT: '0',
      ACX_HEADED: '0',
      ACX_TIMEOUT: '15000',
      ACX_TOOL_TIMEOUT: '20000',
      ACX_IDLE_MS: '0',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const client = new McpClient(proc);
  await sleep(1500);

  try {
    await client.request('initialize', { protocolVersion: '2024-11-05', capabilities: {} });

    // 1. Parallel nav storm to a deliberately slow page (8s delay) - 3 agents at once.
    await timed('parallel tab_new to /slow (a,b,c)',
      () => Promise.all([
        client.call('tab_new', { agent: 'worker-a', tabKey: 'main', url: `${base}/slow` }),
        client.call('tab_new', { agent: 'worker-b', tabKey: 'main', url: `${base}/slow` }),
        client.call('tab_new', { agent: 'worker-c', tabKey: 'main', url: `${base}/slow` }),
      ]));

    // 2. Hanging page: goto must return partial state (warning), not hang the client.
    let hungResult = null;
    let hung = true;
    try {
      hungResult = await timed('tab_new to /hanging returns with warning', async () => {
        const r = await client.call('tab_new', { agent: 'worker-a', tabKey: 'h', url: `${base}/hanging` });
        hung = false;
        return r;
      });
    } catch (e) {
      hung = false;
      check('tab_new to /hanging returns with warning', /timed out|warning/i.test(String(e.message)), e.message.slice(0, 120));
    }
    if (!hung && hungResult) {
      check('tab_new to /hanging has warning', !!hungResult.warning, hungResult.warning || 'none');
    }

    // 3. A second hanging tab, then list tabs - boundedTitle must not hang.
    await client.call('tab_new', { agent: 'worker-b', tabKey: 'h2', url: `${base}/hanging` }).catch(() => {});
    const listRes = await timed('tab_list with hung titles stays bounded', async () => {
      const r = await client.call('tab_list', { agent: 'worker-b' });
      check('tab_list returns titles as strings', r.tabs.every((t) => typeof t.title === 'string'));
      return r;
    });
    check('tab_list still sees 2 tabs', listRes.tabs.length === 2, `${listRes.tabs.length}`);

    // 4. Infinite async evaluate on a live page must be bounded.
    await client.call('tab_new', { agent: 'worker-c', tabKey: 'eval', url: `${base}/instant` });
    let evalBounded = false;
    try {
      await timed('evaluate of never-resolving fn is bounded', () =>
        client.call('evaluate', { agent: 'worker-c', tabKey: 'eval', expression: 'async () => { await new Promise(() => {}); }' }));
    } catch (e) {
      evalBounded = /timed out/i.test(String(e.message));
      check('evaluate timeout error surfaced', evalBounded, e.message.slice(0, 120));
    }

    // 5. wait_for with an absurd timeoutMs must be capped at the tool cap.
    const waitMs = await timed('wait_for huge timeoutMs capped', () =>
      client.call('wait_for', { agent: 'worker-c', tabKey: 'eval', text: 'never-appears', timeoutMs: 60000 }).catch((e) => ({ error: e.message })));
    check('wait_for did not run 60s', (waitMs._ms || 0) < 30000, `${waitMs._ms}ms`);

    // 6. Mixed parallel storm: every agent hammering different targets concurrently.
    const storm = await timed('8-way parallel mixed storm', async () => {
      const jobs = [
        client.call('tab_new', { agent: 'worker-d', tabKey: 'm', url: `${base}/instant` }),
        client.call('tab_new', { agent: 'worker-e', tabKey: 'm', url: `${base}/slow` }),
        client.call('snapshot', { agent: 'worker-c', tabKey: 'main' }),
        client.call('board_post', { agent: 'worker-a', type: 'info', content: 'storm lane 1' }),
        client.call('board_post', { agent: 'worker-b', type: 'info', content: 'storm lane 2' }),
        client.call('board_read', {}),
        client.call('evaluate', { agent: 'worker-a', tabKey: 'main', expression: '1+1' }),
        client.call('current_url', { agent: 'worker-b', tabKey: 'h2' }),
      ];
      const results = await Promise.allSettled(jobs);
      const okCount = results.filter((r) => r.status === 'fulfilled').length;
      check('mixed storm mostly succeeds', okCount >= 6, `${okCount}/8`);
      return results;
    });

    const hub = await client.call('hub_status', {});
    check('hub still responsive after stress', !!hub.name && Array.isArray(hub.agents), `agents=${(hub.agents || []).length}`);

    const board = await client.call('board_read', {});
    check('board intact after stress', board.entries.length >= 2, `${board.entries.length} entries`);
  } catch (e) {
    console.log(`FAIL  scenario exception: ${e.message}`);
    failures++;
  } finally {
    client.close();
    server.close();
    await sleep(300);
    for (const d of [profileDir, teamDir]) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
    }
  }

  console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : `${failures} TEST(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
