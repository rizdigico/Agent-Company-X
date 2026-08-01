import path from 'node:path';
import { readdirSync } from 'node:fs';
import {
  createPage,
  getActiveTab,
  setActive,
  closeTab,
  listTabs,
  allAgents,
  closeAll,
  tabsSummary,
} from './tabs.js';
import {
  postToBoard,
  readBoard,
  clearBoard,
  filterBoard,
  writeRunManifest,
  readRunManifest,
  dashboardHtml,
} from './board.js';

const AGENT_DESC = 'Hub agent name (e.g. orchestrator, worker-a). Each agent can ONLY touch its own tabs.';
const TAB_DESC = 'Optional tabKey; defaults to the agent\'s active tab.';

function requireAgent(params) {
  return (params && params.agent) || 'main';
}

function opt(params, key, fallback) {
  const v = params && params[key];
  return v === undefined || v === null ? fallback : v;
}

const SNAPSHOT_FN = () => {
  const ROLE = {
    a: 'link', button: 'button', input: 'textbox', select: 'combobox', textarea: 'textbox',
    h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
    img: 'img', nav: 'navigation', header: 'banner', footer: 'contentinfo', main: 'main',
    section: 'region', form: 'form', table: 'table', li: 'listitem', ul: 'list', ol: 'list',
    label: 'label', iframe: 'frame', dialog: 'dialog', article: 'article', aside: 'complementary',
    p: 'paragraph', option: 'option', tr: 'row', td: 'cell', th: 'columnheader',
  };
  const TEXT_TAGS = new Set(['p', 'li', 'td', 'th', 'span', 'div', 'em', 'strong', 'code', 'pre', 'blockquote', 'small', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'head', 'meta', 'link', 'title', 'path', 'g', 'defs']);
  const lines = [];
  const ownText = (el) => {
    let t = '';
    for (const n of el.childNodes || []) if (n.nodeType === 3) t += n.textContent || '';
    return t.replace(/\s+/g, ' ').trim().slice(0, 160);
  };
  const visible = (el) => {
    if (el === document.body || el === document.documentElement) return true;
    const r = el.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return false;
    const cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0.05;
  };
  const walk = (el, depth) => {
    if (!el || depth > 40 || lines.length > 900) return;
    const tag = (el.tagName || '').toLowerCase();
    if (SKIP.has(tag)) return;
    if (!visible(el)) return;
    const role = el.getAttribute && (el.getAttribute('role') || ROLE[tag]);
    let name = el.getAttribute ? (el.getAttribute('aria-label') || '') : '';
    let state = '';
    const t = el.getAttribute ? (el.getAttribute('type') || '') : '';
    if (tag === 'input' && (t === 'checkbox' || t === 'radio')) {
      state = ` ${el.checked ? '[checked]' : '[unchecked]'}`;
    }
    if (tag === 'input' || tag === 'textarea') {
      if (!name) name = el.value || el.placeholder || '';
    } else if (tag === 'select') {
      if (!name) name = Array.from(el.selectedOptions || []).map((o) => o.text).join(', ');
    } else if (tag === 'img') {
      if (!name) name = el.getAttribute('alt') || '';
    } else if (!name && role) {
      name = ownText(el) || (el.innerText || '').trim().slice(0, 160);
    }
    if (el.disabled) state = ' [disabled]';
    if (role) {
      lines.push('  '.repeat(Math.min(depth, 15)) + `${role}${name ? `: ${name}` : ''}${state}`);
    } else if (TEXT_TAGS.has(tag) && !el.children.length) {
      const text = ownText(el);
      if (text) lines.push('  '.repeat(Math.min(depth, 15)) + `text: ${text}`);
    }
    for (const child of el.children || []) walk(child, depth + 1);
  };
  walk(document.body, 0);
  return lines;
};

export function createTools(ctx) {
  const { teamDir, boardPath, screenshotsDir, timeout } = ctx;

  const browserTools = {
    hub_status: {
      description: 'Report browser hub health: connected browser, per-agent tab counts, board size, run manifest.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      async run() {
        return {
          name: 'agent-company-browser-hub',
          version: ctx.version,
          browser: ctx.browserName,
          agents: tabsSummary(),
          boardEntries: readBoard(boardPath).length,
          screenshots: countFiles(screenshotsDir),
          run: readRunManifest(teamDir),
          teamDir,
        };
      },
    },
    tab_new: {
      description: 'Open a NEW tab owned by this agent. Agents can NEVER see or use tabs owned by other agents. Returns the tabKey to use in later calls.',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: AGENT_DESC },
          tabKey: { type: 'string', description: 'Unique name for this tab. Defaults to "main" for the agent\'s first tab.' },
          url: { type: 'string', description: 'Optional URL to open in the new tab.' },
        },
        required: [],
      },
      async run(params) {
        const agent = requireAgent(params);
        const tabKey = opt(params, 'tabKey', null) || 'main';
        const rec = await createPage(await ctx.context, agent, tabKey, opt(params, 'url', null), timeout);
        return { agent, tabKey, url: rec.page.url(), title: await safeTitle(rec.page), warning: rec.warning || null };
      },
    },
    tab_list: {
      description: 'List all tabs owned by this agent (key, url, title, active).',
      inputSchema: {
        type: 'object',
        properties: { agent: { type: 'string', description: AGENT_DESC } },
      },
      async run(params) {
        const agent = requireAgent(params);
        return { agent, tabs: await listTabs(agent) };
      },
    },
    tab_switch: {
      description: 'Set the active tab for this agent. Later calls without tabKey use the active tab.',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: AGENT_DESC },
          tabKey: { type: 'string', description: 'The tabKey to make active.' },
        },
        required: ['tabKey'],
      },
      async run(params) {
        return setActive(requireAgent(params), params.tabKey);
      },
    },
    tab_close: {
      description: 'Close one tab owned by this agent.',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: AGENT_DESC },
          tabKey: { type: 'string', description: 'Tab to close. Defaults to the active tab.' },
        },
      },
      async run(params) {
        const agent = requireAgent(params);
        let tabKey = opt(params, 'tabKey', null);
        if (!tabKey) tabKey = getActiveTab(agent, null).page.__hubKey;
        return closeTab(agent, tabKey);
      },
    },
    navigate: {
      description: 'Navigate the agent\'s tab to a URL (waits for DOM content).',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: AGENT_DESC },
          tabKey: { type: 'string', description: TAB_DESC },
          url: { type: 'string' },
        },
        required: ['url'],
      },
      async run(params) {
        const page = getActiveTab(requireAgent(params), params.tabKey).page;
        let resp = null;
        let warning = null;
        try {
          resp = await page.goto(params.url, { waitUntil: 'domcontentloaded', timeout });
        } catch (err) {
          if (err && (err.name === 'TimeoutError' || /Timeout/i.test(err.message || ''))) {
            warning = `goto timed out after ${timeout}ms; page may still be loading`;
          } else {
            throw err;
          }
        }
        return { url: page.url(), title: await safeTitle(page), status: resp ? resp.status() : null, warning };
      },
    },
    snapshot: {
      description: 'DOM snapshot of the agent\'s tab as an indented tree (role: name + state) plus URL and title. Use it to read the page and identify selectors for click/fill/type. Selectors can be CSS, text=..., role=button[name=...], or xpath=...',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: AGENT_DESC },
          tabKey: { type: 'string', description: TAB_DESC },
        },
      },
      async run(params) {
        const page = getActiveTab(requireAgent(params), params.tabKey).page;
        const lines = await bounded(page.evaluate(SNAPSHOT_FN), timeout, 'snapshot');
        return { url: page.url(), title: await safeTitle(page), text: lines.join('\n') };
      },
    },
    click: {
      description: 'Click the first element matching a CSS selector (waits until visible).',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: AGENT_DESC },
          tabKey: { type: 'string', description: TAB_DESC },
          selector: { type: 'string' },
        },
        required: ['selector'],
      },
      async run(params) {
        const page = getActiveTab(requireAgent(params), params.tabKey).page;
        await page.locator(params.selector).first().waitFor({ state: 'visible', timeout });
        await page.locator(params.selector).first().click({ timeout });
        return { clicked: params.selector };
      },
    },
    fill: {
      description: 'Fill a text/input element matching a CSS selector (sets value in one shot).',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: AGENT_DESC },
          tabKey: { type: 'string', description: TAB_DESC },
          selector: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['selector', 'value'],
      },
      async run(params) {
        const page = getActiveTab(requireAgent(params), params.tabKey).page;
        await page.locator(params.selector).first().waitFor({ state: 'visible', timeout });
        await page.locator(params.selector).first().fill(params.value, { timeout });
        return { filled: params.selector };
      },
    },
    type: {
      description: 'Click an element then type text character-by-character (triggers JS key handlers).',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: AGENT_DESC },
          tabKey: { type: 'string', description: TAB_DESC },
          selector: { type: 'string' },
          text: { type: 'string' },
          submit: { type: 'boolean', description: 'Press Enter after typing.' },
        },
        required: ['selector', 'text'],
      },
      async run(params) {
        const page = getActiveTab(requireAgent(params), params.tabKey).page;
        const loc = page.locator(params.selector).first();
        await loc.waitFor({ state: 'visible', timeout });
        await loc.click({ timeout });
        await loc.pressSequentially(params.text, { delay: 5, timeout });
        if (params.submit) await page.keyboard.press('Enter');
        return { typed: params.selector, submit: !!params.submit };
      },
    },
    press: {
      description: 'Press a keyboard key on the agent\'s tab (e.g. Enter, Escape, Tab, ArrowDown).',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: AGENT_DESC },
          tabKey: { type: 'string', description: TAB_DESC },
          key: { type: 'string' },
        },
        required: ['key'],
      },
      async run(params) {
        const page = getActiveTab(requireAgent(params), params.tabKey).page;
        await page.keyboard.press(params.key);
        return { pressed: params.key };
      },
    },
    select_option: {
      description: 'Select an option in a <select> element by value, label, or index.',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: AGENT_DESC },
          tabKey: { type: 'string', description: TAB_DESC },
          selector: { type: 'string' },
          values: { type: 'array', items: { type: 'string' } },
        },
        required: ['selector', 'values'],
      },
      async run(params) {
        const page = getActiveTab(requireAgent(params), params.tabKey).page;
        await page.locator(params.selector).first().selectOption(params.values, { timeout });
        return { selected: params.selector, values: params.values };
      },
    },
    evaluate: {
      description: 'Evaluate a JavaScript expression or function body in the agent\'s tab. Return values must be JSON-serializable.',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: AGENT_DESC },
          tabKey: { type: 'string', description: TAB_DESC },
          expression: { type: 'string' },
        },
        required: ['expression'],
      },
      async run(params) {
        const page = getActiveTab(requireAgent(params), params.tabKey).page;
        const s = String(params.expression).trim();
        const looksLikeFn = /^(async\s+)?function\b|^\([^)]*\)\s*=>|^[A-Za-z_$][\w$]*\s*=>|^async\s*\(/.test(s);
        if (looksLikeFn) {
          const fn = new Function(`return (${s})`)();
          return { result: await bounded(page.evaluate(fn), timeout, 'evaluate') };
        }
        return { result: await bounded(page.evaluate(s), timeout, 'evaluate') };
      },
    },
    wait_for: {
      description: 'Wait for text to appear on the agent\'s tab (or a fixed timeout in ms if text omitted).',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: AGENT_DESC },
          tabKey: { type: 'string', description: TAB_DESC },
          text: { type: 'string', description: 'Text to wait for (substring).' },
          timeoutMs: { type: 'number', description: 'Max wait in ms. Default 30000.' },
        },
      },
      async run(params) {
        const page = getActiveTab(requireAgent(params), params.tabKey).page;
        const ms = Math.min(opt(params, 'timeoutMs', timeout), ctx.toolCap);
        if (!params.text) {
          await page.waitForTimeout(ms);
          return { waited: ms };
        }
        await page.getByText(params.text).first().waitFor({ state: 'visible', timeout: ms });
        return { textFound: params.text };
      },
    },
    go_back: {
      description: 'Go back in the agent\'s tab history.',
      inputSchema: {
        type: 'object',
        properties: { agent: { type: 'string', description: AGENT_DESC }, tabKey: { type: 'string', description: TAB_DESC } },
      },
      async run(params) {
        const page = getActiveTab(requireAgent(params), params.tabKey).page;
        await page.goBack({ timeout });
        return { url: page.url() };
      },
    },
    go_forward: {
      description: 'Go forward in the agent\'s tab history.',
      inputSchema: {
        type: 'object',
        properties: { agent: { type: 'string', description: AGENT_DESC }, tabKey: { type: 'string', description: TAB_DESC } },
      },
      async run(params) {
        const page = getActiveTab(requireAgent(params), params.tabKey).page;
        await page.goForward({ timeout });
        return { url: page.url() };
      },
    },
    reload: {
      description: 'Reload the agent\'s tab.',
      inputSchema: {
        type: 'object',
        properties: { agent: { type: 'string', description: AGENT_DESC }, tabKey: { type: 'string', description: TAB_DESC } },
      },
      async run(params) {
        const page = getActiveTab(requireAgent(params), params.tabKey).page;
        await page.reload({ timeout });
        return { url: page.url(), title: await safeTitle(page) };
      },
    },
    current_url: {
      description: 'Current URL and title of the agent\'s tab.',
      inputSchema: {
        type: 'object',
        properties: { agent: { type: 'string', description: AGENT_DESC }, tabKey: { type: 'string', description: TAB_DESC } },
      },
      async run(params) {
        const page = getActiveTab(requireAgent(params), params.tabKey).page;
        return { url: page.url(), title: await safeTitle(page) };
      },
    },
    screenshot: {
      description: 'Save a screenshot of the agent\'s tab to the team screenshots dir and return its file path + a URL served by the hub dashboard.',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: AGENT_DESC },
          tabKey: { type: 'string', description: TAB_DESC },
          fullPage: { type: 'boolean', description: 'Capture the full scrollable page.' },
        },
      },
      async run(params) {
        const agent = requireAgent(params);
        const page = getActiveTab(agent, params.tabKey).page;
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const file = `${agent}-${page.__hubKey}-${ts}.png`;
        const abs = path.join(screenshotsDir, file);
        await page.screenshot({ path: abs, fullPage: !!params.fullPage, timeout });
        return { file, path: abs, url: `/screenshots/${file}` };
      },
    },
    console: {
      description: 'Return recent console messages (errors/warnings) from the agent\'s tab.',
      inputSchema: {
        type: 'object',
        properties: { agent: { type: 'string', description: AGENT_DESC }, tabKey: { type: 'string', description: TAB_DESC } },
      },
      async run(params) {
        const page = getActiveTab(requireAgent(params), params.tabKey).page;
        const msgs = (page.__hubConsole || []).slice(-50);
        return { count: msgs.length, messages: msgs };
      },
    },
  };

  const boardTools = {
    board_post: {
      description: 'Post a message to the shared team board (A2A communication). Types: info, task, result, artifact, veto, error. All agents and the human dashboard can read these.',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: AGENT_DESC },
          type: { type: 'string', enum: ['info', 'task', 'result', 'artifact', 'veto', 'error'] },
          content: { type: 'string' },
        },
        required: ['type', 'content'],
      },
      async run(params) {
        const MAX_BODY = 8000;
        const content = String(params.content).slice(0, MAX_BODY);
        const entry = postToBoard(boardPath, requireAgent(params), params.type, content, {
          tab: params.tabKey || null,
        });
        return { id: entry.id, ts: entry.ts, agent: entry.agent, truncated: String(params.content).length > MAX_BODY };
      },
    },
    board_read: {
          description: 'Read board entries. Optional filters: agent (only entries by that agent), type, limit (last N). All agents can read everything - the board is the shared truth.',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: 'Filter to entries posted by this agent.' },
          type: { type: 'string', description: 'Filter by type: info, task, result, artifact, veto, error.' },
          since: { type: 'string', description: 'ISO timestamp; only entries after it.' },
          limit: { type: 'number', description: 'Return only the last N entries (default 200).' },
        },
      },
      async run(params) {
        return { entries: filterBoard(boardPath, params) };
      },
    },
    board_clear: {
      description: 'Wipe the board (start of a new run). Only the orchestrator should do this.',
      inputSchema: { type: 'object', properties: { agent: { type: 'string', description: AGENT_DESC } } },
      async run(params) {
        clearBoard(boardPath);
        return { cleared: true };
      },
    },
    run_start: {
      description: 'Write the run manifest (mission, team roster, models, status). The orchestrator posts this at the start of every run.',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: AGENT_DESC },
          mission: { type: 'string' },
          team: { type: 'array', items: { type: 'string' } },
          models: { type: 'object' },
          status: { type: 'string', description: 'pending | running | verifying | done | failed' },
        },
        required: ['mission'],
      },
      async run(params) {
        const manifest = {
          startedAt: new Date().toISOString(),
          mission: params.mission,
          team: params.team || [],
          models: params.models || {},
          status: opt(params, 'status', 'running'),
          updatedAt: new Date().toISOString(),
        };
        writeRunManifest(teamDir, manifest);
        return manifest;
      },
    },
    run_status: {
      description: 'Update or read the run manifest status. Pass status to update, omit to read.',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: AGENT_DESC },
          status: { type: 'string', description: 'pending | running | verifying | done | failed' },
          note: { type: 'string' },
        },
      },
      async run(params) {
        const existing = readRunManifest(teamDir) || {};
        if (params.status) {
          const updated = { ...existing, status: params.status, updatedAt: new Date().toISOString() };
          if (params.note) updated.note = params.note;
          writeRunManifest(teamDir, updated);
          return updated;
        }
        return existing;
      },
    },
  };

  const allTools = { ...browserTools, ...boardTools };
  return Object.entries(allTools).map(([name, def]) => ({
    name,
    description: def.description,
    inputSchema: def.inputSchema,
    run: def.run,
  }));
}

function countFiles(dir) {
  try {
    return readdirSync(dir).length;
  } catch {
    return 0;
  }
}

const TITLE_RACE_MS = 2500;

function bounded(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function safeTitle(page) {
  try {
    return await Promise.race([
      page.title(),
      new Promise((resolve) => setTimeout(() => resolve(''), TITLE_RACE_MS)),
    ]);
  } catch {
    return '';
  }
}

export async function attachConsoleCapture(ctx) {
  const verbose = !!ctx.verbose;
  const context = await ctx.context;
  for (const page of context.pages()) {
    if (!page.__hubConsole) page.__hubConsole = [];
    page.removeAllListeners('console');
    page.on('console', (msg) => {
      const text = msg.text();
      if (!page.__hubConsole) page.__hubConsole = [];
      page.__hubConsole.push({ ts: new Date().toISOString(), level: msg.type(), text });
      if (page.__hubConsole.length > 200) page.__hubConsole.shift();
      if (verbose && (msg.type() === 'error' || msg.type() === 'warning')) {
        process.stderr.write(`[console:${page.__hubAgent || '?'}] ${msg.type()}: ${text.slice(0, 500)}\n`);
      }
    });
  }
}
