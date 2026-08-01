import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HUB = path.join(__dirname, '..', 'hub.mjs');

const proc = spawn(process.execPath, [HUB], {
  env: {
    ...process.env,
    ACX_PROFILE_DIR: path.join(process.env.TEMP, 'acx-debug-profile'),
    ACX_TEAM_DIR: path.join(process.env.TEMP, 'acx-debug-team'),
    ACX_HUB_PORT: '0',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buf = Buffer.alloc(0);

proc.stdout.on('data', (c) => {
  buf = Buffer.concat([buf, Buffer.from(c)]);
  for (;;) {
    const headerEnd = buf.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) return;
    const header = buf.slice(0, headerEnd).toString('utf8');
    const m = /Content-Length:\s*(\d+)/i.exec(header);
    if (!m) { buf = buf.slice(headerEnd + 4); continue; }
    const len = parseInt(m[1], 10);
    if (buf.length < headerEnd + 4 + len) return;
    const body = buf.slice(headerEnd + 4, headerEnd + 4 + len).toString('utf8');
    buf = buf.slice(headerEnd + 4 + len);
    let msg;
    try { msg = JSON.parse(body); } catch (e) { console.log('PARSE FAIL:', body.slice(0, 200)); return; }
    console.log('RECV id=' + msg.id + ' method=' + (msg.method || '-') + ' hasResult=' + (msg.result !== undefined) + ' tools=' + (msg.result?.tools?.length ?? '-'));
    if (msg.id === 2) {
      proc.kill();
      process.exit(0);
    }
  }
});
proc.stderr.setEncoding('utf8');
proc.stderr.on('data', (c) => process.stderr.write('[hub] ' + c));

function send(id, method, params) {
  const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  proc.stdin.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`);
}

setTimeout(() => send(1, 'initialize', { protocolVersion: '2024-11-05' }), 1200);
setTimeout(() => send(2, 'tools/list', {}), 2500);
setTimeout(() => { console.log('TIMEOUT - no tools/list response'); proc.kill(); process.exit(1); }, 15000);
