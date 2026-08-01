import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function resolvePlaywright() {
  try {
    return require('playwright-core');
  } catch (e1) {
    const candidates = [
      process.env.ACX_PW_PATH,
      'C:\\Users\\aariz\\AppData\\Roaming\\npm\\node_modules\\@playwright\\mcp\\node_modules',
    ].filter(Boolean);
    for (const base of candidates) {
      try {
        const resolved = require.resolve('playwright-core', { paths: [base] });
        return require(resolved);
      } catch (e2) {
        // try next candidate
      }
    }
    throw new Error('playwright-core not resolvable. Run "npm install" in server/browser-hub or set ACX_PW_PATH.');
  }
}

export class McpServer {
  constructor({ name, version, tools, log }) {
    this.name = name;
    this.version = version;
    this.tools = tools;
    this.log = log || (() => {});
    this.buffer = '';
    this.requestId = 0;
  }

  start() {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => this._onData(chunk));
    process.stdin.on('end', () => this._exit(0));
    process.stdin.on('error', () => this._exit(1));
  }

  _onData(chunk) {
    this.buffer += chunk;
    for (;;) {
      const idx = this.buffer.indexOf('\r\n\r\n');
      if (idx === -1) return;
      const header = this.buffer.slice(0, idx);
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.buffer = this.buffer.slice(idx + 4);
        continue;
      }
      const len = parseInt(match[1], 10);
      if (this.buffer.length < idx + 4 + len) return;
      const body = this.buffer.slice(idx + 4, idx + 4 + len);
      this.buffer = this.buffer.slice(idx + 4 + len);
      this._handle(JSON.parse(body));
    }
  }

  _send(msg) {
    const json = JSON.stringify(msg);
    const out = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
    this.log(`[mcp] <- id=${msg.id ?? '-'} bytes=${Buffer.byteLength(out, 'utf8')}`);
    process.stdout.write(out);
  }

  _handle(msg) {
    if (!msg || typeof msg !== 'object' || !msg.method) return;
    const { id, method, params } = msg;
    this.log(`[mcp] -> ${method} id=${id ?? '-'}`);

    if (method === 'notifications/initialized' || method === 'initialized') {
      this.log('[mcp] client initialized');
      return;
    }

    const respond = (result) => {
      if (id !== undefined && id !== null) this._send({ jsonrpc: '2.0', id, result });
    };
    const fail = (code, message) => {
      if (id !== undefined && id !== null) this._send({ jsonrpc: '2.0', id, error: { code, message } });
    };

    if (method === 'initialize') {
      const requested = (params && params.protocolVersion) || '2024-11-05';
      this.log(`[mcp] initialize (protocol ${requested})`);
      respond({
        protocolVersion: requested,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: this.name, version: this.version },
      });
      return;
    }

    if (method === 'ping') {
      respond({});
      return;
    }

    if (method === 'tools/list') {
      this.log(`[mcp] tools/list requested`);
      respond({
        tools: this.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
      return;
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params || {};
      const tool = this.tools.find((t) => t.name === name);
      if (!tool) {
        fail(-32602, `Unknown tool: ${name}`);
        return;
      }
      Promise.resolve()
        .then(() => tool.run(args || {}))
        .then((result) => {
          const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          respond({ content: [{ type: 'text', text }] });
        })
        .catch((err) => {
          this.log(`[mcp] tool ${name} failed: ${err.message}`);
          respond({
            content: [{ type: 'text', text: `ERROR: ${err.message}` }],
            isError: true,
          });
        });
      return;
    }

    if (method === 'shutdown') {
      respond({});
      this._exit(0);
      return;
    }

    if (method === 'exit') {
      this._exit(0);
      return;
    }

    this.log(`[mcp] unhandled method: ${method}`);
    fail(-32601, `Method not found: ${method}`);
  }

  _exit(code) {
    process.exit(code);
  }
}
