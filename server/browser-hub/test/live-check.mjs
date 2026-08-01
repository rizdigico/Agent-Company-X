import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HUB = path.join(__dirname, '..', 'hub.mjs');

class McpClient {
  constructor(proc) {
    this.proc = proc;
    this.buf = Buffer.alloc(0);
    this.pending = new Map();
    this.nextId = 1;
    proc.stdout.on('data', (c) => this._onData(Buffer.from(c)));
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const useRealEnv = process.argv.includes('--real');
  const env = { ...process.env };
  if (useRealEnv) {
    // Mirrors config/kilo.jsonc's browser-hub entry exactly
    env.ACX_PROFILE_DIR = path.join(os.homedir(), '.cache', 'kilo', 'agent-company', 'profile');
    env.ACX_TEAM_DIR = path.join(os.homedir(), 'kilo_HQ', '.team');
    env.ACX_HUB_PORT = '17789';
    env.ACX_HEADED = '0';
    console.log('=== live-install check: hub exactly as configured in kilo.jsonc ===');
  } else {
    env.ACX_PROFILE_DIR = path.join(process.env.TEMP || '.', `acx-live-profile-${Date.now()}`);
    env.ACX_TEAM_DIR = path.join(process.env.TEMP || '.', `acx-live-team-${Date.now()}`);
    env.ACX_HUB_PORT = '0';
    env.ACX_HEADED = '0';
    console.log('=== live-install check: hub (temp profile/team) ===');
  }

  const tmpDirs = useRealEnv ? [] : [env.ACX_PROFILE_DIR, env.ACX_TEAM_DIR];

  const proc = spawn(process.execPath, [HUB], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  proc.stderr.setEncoding('utf8');
  let bootLog = '';
  proc.stderr.on('data', (c) => { bootLog += c; });
  const client = new McpClient(proc);
  await sleep(1800);

  let ok = true;
  try {
    const init = await client.request('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
    if (init.result?.serverInfo?.name !== 'agent-company-browser-hub') { ok = false; console.log('FAIL initialize'); }
    else console.log('PASS initialize');

    const status = await client.call('hub_status', {});
    if (!status.name || !Array.isArray(status.agents)) { ok = false; console.log('FAIL hub_status'); }
    else console.log(`PASS hub_status  browser=${status.browser} boardEntries=${status.boardEntries}`);

    const list = await client.request('tools/list', {});
    const n = (list.result?.tools || []).length;
    if (n < 20) { ok = false; console.log(`FAIL tools/list (${n})`); }
    else console.log(`PASS tools/list  ${n} tools`);
  } catch (e) {
    ok = false;
    console.log(`FAIL  ${e.message}`);
  } finally {
    client.close();
  }
  await sleep(400);
  if (/browser launched/.test(bootLog)) console.log('PASS browser launched (log)');
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
  }
  if (useRealEnv) {
    // The hub is hard-killed by client.close(), so its SIGTERM handler never runs;
    // remove the profile lock it left behind (next launch would take it over anyway).
    try { fs.rmSync(path.join(env.ACX_PROFILE_DIR, 'hub.lock'), { force: true }); } catch {}
  }
  if (ok) console.log('\nINSTALL VERIFIED');
  else console.log('\nINSTALL CHECK FAILED');
  process.exit(ok ? 0 : 1);
}

main();
