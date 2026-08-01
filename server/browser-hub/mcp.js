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

const CRLFCRLF = Buffer.from('\r\n\r\n');

export class McpServer {
  constructor({ name, version, tools, log, verbose = false, toolTimeout = 25000 }) {
    this.name = name;
    this.version = version;
    this.tools = tools;
    this.log = log || (() => {});
    this.verbose = !!verbose;
    this.toolTimeout = toolTimeout;
    this.buf = Buffer.alloc(0);
    this.lastActivity = Date.now();
    this.onActivity = null;
  }

  touch() {
    this.lastActivity = Date.now();
    if (this.onActivity) this.onActivity();
  }

  start() {
    process.stdin.on('data', (chunk) => {
      this.touch();
      this._onData(Buffer.from(chunk));
    });
    process.stdin.on('end', () => this._exit(0));
    process.stdin.on('error', () => this._exit(1));
    process.stdin.on('close', () => this._exit(0));
    process.stdout.on('error', () => {});
  }

  _onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      const idx = this.buf.indexOf(CRLFCRLF);
      if (idx === -1) return;
      const header = this.buf.slice(0, idx).toString('utf8');
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.buf = this.buf.slice(idx + 4);
        continue;
      }
      const len = parseInt(match[1], 10);
      if (this.buf.length < idx + 4 + len) return;
      const body = this.buf.slice(idx + 4, idx + 4 + len);
      this.buf = this.buf.slice(idx + 4 + len);
      let msg;
      try {
        msg = JSON.parse(body.toString('utf8'));
      } catch (err) {
        this._send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: `Parse error: ${err.message}` } });
        continue;
      }
      this._handle(msg);
    }
  }

  _send(msg) {
    let out;
    try {
      const json = JSON.stringify(msg);
      out = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
    } catch (err) {
      out = `Content-Length: 0\r\n\r\n`;
    }
    if (this.verbose) this.log(`[mcp] <- id=${msg.id ?? '-'} bytes=${Buffer.byteLength(out, 'utf8')}`);
    try {
      process.stdout.write(out);
    } catch {
      // client gone
    }
  }

  _handle(msg) {
    if (!msg || typeof msg !== 'object' || !msg.method) return;
    const { id, method, params } = msg;
    if (this.verbose) this.log(`[mcp] -> ${method} id=${id ?? '-'}`);

    if (method === 'notifications/initialized' || method === 'initialized') {
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
      if (this.verbose) this.log(`[mcp] initialize (protocol ${requested})`);
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
      this._runTool(tool, args || {}, respond, fail);
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

    if (this.verbose) this.log(`[mcp] unhandled method: ${method}`);
    fail(-32601, `Method not found: ${method}`);
  }

  _runTool(tool, args, respond, fail) {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    Promise.resolve()
      .then(() => tool.run(args))
      .then(
        (result) => {
          let text;
          try {
            text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          } catch (err) {
            text = `ERROR: result not serializable: ${err.message}`;
          }
          finish(respond, { content: [{ type: 'text', text }] });
        },
        (err) => {
          const msg = err && err.message ? err.message : String(err);
          finish(respond, { content: [{ type: 'text', text: `ERROR: ${msg}` }], isError: true });
        }
      );

    const timer = setTimeout(() => {
      const msg = `Operation timed out after ${this.toolTimeout}ms (tool ${tool.name})`;
      this.log(`[mcp] ${msg}`);
      finish(respond, { content: [{ type: 'text', text: `ERROR: ${msg}` }], isError: true });
    }, this.toolTimeout);
  }

  _exit(code) {
    process.exit(code);
  }
}
