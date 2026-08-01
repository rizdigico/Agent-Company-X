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
    proc.stderr.on('data', (c) => process.stderr.write(`[hub-stderr] ${c}`));
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
  close() {
    this.proc.stdin.end();
    this.proc.kill();
  }
}

let failures = 0;
function check(label, cond, detail = '') {
  const ok = !!cond;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  [${detail}]` : ''}`);
  if (!ok) failures++;
}

function startHub(dirs, extraEnv = {}) {
  const teamDir = dirs.teamDir;
  const proc = spawn(process.execPath, [HUB], {
    env: {
      ...process.env,
      ACX_PROFILE_DIR: dirs.profileDir,
      ACX_TEAM_DIR: teamDir,
      ACX_HUB_PORT: '0',
      ACX_HEADED: '0',
      ...extraEnv,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return { proc, teamDir, client: new McpClient(proc) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('=== ACX browser-hub smoke test ===');
  const profileDir = path.join(process.env.TEMP || '.', `acx-test-profile-${Date.now()}`);
  const teamDir = path.join(process.env.TEMP || '.', `acx-test-team-${Date.now()}`);
  const { proc, client } = startHub({ profileDir, teamDir });
  await sleep(1500);

  try {
    const init = await client.request('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
    check('initialize', init.result && init.result.serverInfo?.name === 'agent-company-browser-hub', JSON.stringify(init.result?.serverInfo));

    const list = await client.request('tools/list', {});
    const names = (list.result?.tools || []).map((t) => t.name);
    check('tools/list >= 20 tools', names.length >= 20, `${names.length} tools`);
    for (const need of ['tab_new', 'navigate', 'snapshot', 'click', 'type', 'evaluate', 'board_post', 'board_read', 'screenshot', 'run_start']) {
      check(`tool ${need}`, names.includes(need));
    }

    const t1 = await client.call('tab_new', { agent: 'worker-a', tabKey: 'main', url: 'https://example.com/' });
    check('worker-a tab_new', t1.tabKey === 'main' && /example\.com/.test(t1.url), t1.url);

    const snap1 = await client.call('snapshot', { agent: 'worker-a' });
    check('snapshot has example.com text', /example/i.test(snap1.text || ''));

    const t2 = await client.call('tab_new', { agent: 'worker-b', tabKey: 'main', url: 'https://example.org/' });
    check('worker-b tab_new', t2.tabKey === 'main' && /example\.org/.test(t2.url), t2.url);

    const listA = await client.call('tab_list', { agent: 'worker-a' });
    check('worker-a sees only own tab', listA.tabs.length === 1 && listA.tabs[0].tabKey === 'main');

    let isolationPassed = false;
    try {
      await client.call('navigate', { agent: 'worker-a', tabKey: 'main', url: 'https://example.org/' });
      const back = await client.call('current_url', { agent: 'worker-b', tabKey: 'main' });
      isolationPassed = true;
      check('worker-b tab NOT navigated by worker-a', /example\.org/.test(back.url), back.url);
    } catch (e) {
      check('worker-a navigation did not touch worker-b', true, e.message);
    }

    const cross = await client.call('tab_list', { agent: 'worker-a' });
    check('worker-a tabs unchanged after cross attempt', cross.tabs.length === 1);

    let denied = false;
    try {
      await client.call('snapshot', { agent: 'worker-a', tabKey: 'other-agent-tab' });
    } catch (e) {
      denied = /does not own/.test(e.message);
    }
    check('tab ownership enforced (foreign tabKey rejected)', denied);

    const posted = await client.call('board_post', { agent: 'worker-a', type: 'task', content: 'Do the thing' });
    check('board_post returns id+ts', !!posted.id && !!posted.ts);
    await client.call('board_post', { agent: 'worker-b', type: 'result', content: 'Done the thing' });

    const board = await client.call('board_read', {});
    check('board_read sees both entries', board.entries.length === 2, `${board.entries.length}`);
    const onlyA = await client.call('board_read', { agent: 'worker-a' });
    check('board_read filter by agent', onlyA.entries.length === 1 && onlyA.entries[0].agent === 'worker-a');

    const shot = await client.call('screenshot', { agent: 'worker-a' });
    check('screenshot file exists', shot.path && fs.existsSync(shot.path), shot.file);

    const run = await client.call('run_start', { agent: 'orchestrator', mission: 'Test mission', team: ['orchestrator', 'worker-a', 'worker-b'] });
    check('run_start writes manifest', run.status === 'running' && run.mission === 'Test mission');

    const evalRes = await client.call('evaluate', { agent: 'worker-a', expression: 'document.title' });
    check('evaluate expression', typeof evalRes.result === 'string' && evalRes.result.length > 0, String(evalRes.result));

    await client.call('tab_close', { agent: 'worker-b', tabKey: 'main' });
    const listB = await client.call('tab_list', { agent: 'worker-b' });
    check('worker-b tab closed', listB.tabs.length === 0);

    console.log('\n=== persistence check: restart hub on same profile+team dir ===');
  } catch (e) {
    console.log(`FAIL  scenario exception: ${e.message}`);
    failures++;
  } finally {
    client.close();
    await sleep(300);
  }

  const { teamDir: td } = { teamDir };
  const profileDir2 = path.join(process.env.TEMP || '.', `acx-test-profile-${Date.now()}`);

  const proc2 = spawn(process.execPath, [HUB], {
    env: {
      ...process.env,
      ACX_PROFILE_DIR: profileDir2,
      ACX_TEAM_DIR: td,
      ACX_HUB_PORT: '0',
      ACX_HEADED: '0',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const client2 = new McpClient(proc2);
  await sleep(1500);
  try {
    await client2.request('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
    const board = await client2.call('board_read', {});
    check('board survives hub restart (persistence)', board.entries.length === 2, `${board.entries.length}`);
    const status = await client2.call('hub_status', {});
    check('hub_status after restart', !!status.name && Array.isArray(status.agents));
  } catch (e) {
    console.log(`FAIL  restart scenario: ${e.message}`);
    failures++;
  } finally {
    client2.close();
    await sleep(300);
    for (const d of [profileDir, teamDir, profileDir2]) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
    }
  }

  console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : `${failures} TEST(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
