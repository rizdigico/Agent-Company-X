import { spawn } from 'node:child_process';
import fs from 'node:fs';
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
    proc.stderr.on('data', (c) => {});
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
        const { resolve } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        resolve(msg);
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

async function main() {
  console.log('=== ACX heavy test: parallel agents, one browser, veto loop ===');
  const teamDir = path.join(process.env.TEMP || '.', `acx-heavy-team-${Date.now()}`);
  const deliverDir = path.join(teamDir, 'deliverables');
  fs.mkdirSync(deliverDir, { recursive: true });
  const proc = spawn(process.execPath, [HUB], {
    env: {
      ...process.env,
      ACX_PROFILE_DIR: path.join(process.env.TEMP || '.', `acx-heavy-profile-${Date.now()}`),
      ACX_TEAM_DIR: teamDir,
      ACX_HUB_PORT: '0',
      ACX_HEADED: '0',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const client = new McpClient(proc);
  await sleep(1500);

  try {
    await client.request('initialize', { protocolVersion: '2024-11-05', capabilities: {} });

    const orch = { agent: 'orchestrator' };
    const a = { agent: 'worker-a' };
    const b = { agent: 'worker-b' };
    const v = { agent: 'verifier' };

    const run = await client.call('run_start', { ...orch, mission: 'Heavy parallel mission', team: ['orchestrator', 'worker-a', 'worker-b', 'verifier'] });
    check('run_start', run.status === 'running');

    // Phase 1: parallel navigation storm - 3 agents, 3 sites, concurrently
    await Promise.all([
      client.call('tab_new', { ...a, tabKey: 'main', url: 'https://example.com/' }),
      client.call('tab_new', { ...b, tabKey: 'main', url: 'https://example.org/' }),
      client.call('tab_new', { ...v, tabKey: 'main', url: 'https://example.net/' }),
    ]);
    const urls = await Promise.all([
      client.call('current_url', { ...a, tabKey: 'main' }),
      client.call('current_url', { ...b, tabKey: 'main' }),
      client.call('current_url', { ...v, tabKey: 'main' }),
    ]);
    check('parallel navigation isolated', /example\.com/.test(urls[0].url) && /example\.org/.test(urls[1].url) && /example\.net/.test(urls[2].url),
      `${urls[0].url} | ${urls[1].url} | ${urls[2].url}`);

    // Phase 2: cross-agent ownership denial under load
    let denied = false;
    try { await client.call('navigate', { ...b, tabKey: 'other-agent-main', url: 'https://example.com/' }); } catch (e) { denied = /does not own/.test(e.message); }
    check('ownership enforced (foreign tabKey rejected)', denied);
    const snapA = await client.call('snapshot', { ...a, tabKey: 'main' });
    check('worker-a tab still its own', /example/i.test(snapA.text || ''));

    // Phase 3: the mini-loop - task -> result -> veto -> fix -> PASS
    await client.call('board_post', { ...orch, type: 'task', content: 'Produce deliverable report.html that states 2+2=4' });

    const html = '<html><body><h1>Report</h1><p>2+2 = 5</p></body></html>';
    const deliverable = path.join(deliverDir, 'report.html');
    fs.writeFileSync(deliverable, html);
    await client.call('board_post', { ...a, type: 'result', content: `Deliverable: ${deliverable}` });

    // Verifier opens the deliverable in its own tab and inspects
    await client.call('navigate', { ...v, tabKey: 'main', url: `file:///${deliverable.replace(/\\/g, '/')}` });
    const snapV = await client.call('snapshot', { ...v, tabKey: 'main' });
    const wrong = /2\+2 = 5/.test(snapV.text || '');
    check('verifier read the deliverable', /Report/i.test(snapV.text || ''));
    if (wrong) {
      await client.call('board_post', { ...v, type: 'veto', content: 'FAIL: report.html states 2+2=5, expected 4. Fix before delivery.' });
    } else {
      await client.call('board_post', { ...v, type: 'veto', content: 'PASS' });
    }

    // Orchestrator sees the veto, routes fix to worker-b
    const board1 = await client.call('board_read', {});
    const veto = board1.entries.filter((e) => e.type === 'veto').pop();
    check('veto posted with defect', veto && /2\+2/.test(veto.content), veto?.content);

    fs.writeFileSync(deliverable, '<html><body><h1>Report</h1><p>2+2 = 4</p></body></html>');
    await client.call('board_post', { ...b, type: 'result', content: `Fixed deliverable: ${deliverable}` });

    // Verifier re-checks
    await client.call('navigate', { ...v, tabKey: 'main', url: `file:///${deliverable.replace(/\\/g, '/')}` });
    const snapV2 = await client.call('snapshot', { ...v, tabKey: 'main' });
    const fixed = /2\+2 = 4/.test(snapV2.text || '');
    check('verifier sees the fix', fixed);
    await client.call('board_post', { ...v, type: 'veto', content: 'PASS' });

    const board2 = await client.call('board_read', {});
    const vetos = board2.entries.filter((e) => e.type === 'veto');
    check('loop ended with PASS veto', vetos.length === 2 && vetos[1].content === 'PASS', vetos[1]?.content);

    // Phase 4: parallel board traffic from all agents
    await Promise.all([
      client.call('board_post', { ...a, type: 'info', content: 'lane A done' }),
      client.call('board_post', { ...b, type: 'info', content: 'lane B done' }),
      client.call('board_post', { ...v, type: 'info', content: 'lane V done' }),
    ]);
    const board3 = await client.call('board_read', {});
    check('parallel board posts all landed', board3.entries.length >= 7, `${board3.entries.length}`);

    const status = await client.call('run_status', {});
    check('run_status tracks mission', status.mission === 'Heavy parallel mission', status.mission);

    const hub = await client.call('hub_status', {});
    const agentNames = (hub.agents || []).map((x) => typeof x === 'object' ? x.agent : x);
    check('hub tracks all working agents', agentNames.length >= 3 && ['worker-a', 'worker-b', 'verifier'].every((n) => agentNames.includes(n)), agentNames.join(','));
  } catch (e) {
    console.log(`FAIL  scenario exception: ${e.message}`);
    failures++;
  } finally {
    client.close();
  }

  console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : `${failures} TEST(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
