const TABS = new Map();

export function ensureAgent(agent) {
  if (!TABS.has(agent)) TABS.set(agent, new Map());
  return TABS.get(agent);
}

export async function createPage(context, agent, tabKey, url, timeout) {
  const agentTabs = ensureAgent(agent);
  if (agentTabs.has(tabKey)) {
    throw new Error(`agent "${agent}" already owns tab "${tabKey}". Use tab_list to see your tabs, or pick a unique tabKey.`);
  }
  const page = await context.newPage();
  page.__hubAgent = agent;
  page.__hubKey = tabKey;
  const rec = { page, active: true, openedAt: new Date().toISOString(), warning: null };
  for (const [, other] of agentTabs) other.active = false;
  agentTabs.set(tabKey, rec);
  page.on('close', () => {
    if (agentTabs.get(tabKey)?.page === page) agentTabs.delete(tabKey);
  });
  if (url) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (err && err.name === 'TimeoutError') {
        rec.warning = `initial goto timed out after ${timeout}ms; page may still be loading`;
      } else if (/net::ERR|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED/i.test(msg)) {
        rec.warning = msg.split('\n')[0];
      } else {
        rec.warning = msg.split('\n')[0];
      }
    }
  }
  return rec;
}

export function getTab(agent, tabKey) {
  const agentTabs = TABS.get(agent);
  if (!agentTabs || agentTabs.size === 0) {
    throw new Error(`agent "${agent}" has no tabs. Create one with tab_new first.`);
  }
  const rec = agentTabs.get(tabKey);
  if (!rec) {
    throw new Error(`agent "${agent}" does not own tab "${tabKey}". Owned tabs: ${[...agentTabs.keys()].join(', ') || 'none'}`);
  }
  return rec;
}

export function getActiveTab(agent, tabKey) {
  const agentTabs = TABS.get(agent);
  if (!agentTabs || agentTabs.size === 0) {
    throw new Error(`agent "${agent}" has no tabs. Create one with tab_new first.`);
  }
  if (tabKey) return getTab(agent, tabKey);
  const active = [...agentTabs.values()].find((r) => r.active);
  return active || [...agentTabs.values()][0];
}

export function setActive(agent, tabKey) {
  const agentTabs = ensureAgent(agent);
  if (!agentTabs.has(tabKey)) {
    throw new Error(`agent "${agent}" does not own tab "${tabKey}". Owned tabs: ${[...agentTabs.keys()].join(', ') || 'none'}`);
  }
  for (const [, other] of agentTabs) other.active = false;
  agentTabs.get(tabKey).active = true;
  return { agent, tabKey };
}

export function closeTab(agent, tabKey) {
  const agentTabs = TABS.get(agent);
  if (!agentTabs || !agentTabs.has(tabKey)) {
    throw new Error(`agent "${agent}" does not own tab "${tabKey}".`);
  }
  const rec = agentTabs.get(tabKey);
  agentTabs.delete(tabKey);
  return rec.page.close().then(() => ({ agent, tabKey, closed: true }));
}

const TITLE_RACE_MS = 2500;

async function boundedTitle(page) {
  try {
    return await Promise.race([
      page.title(),
      new Promise((resolve) => setTimeout(() => resolve(''), TITLE_RACE_MS)),
    ]);
  } catch {
    return '';
  }
}

export async function listTabs(agent) {
  const agentTabs = TABS.get(agent);
  if (!agentTabs || agentTabs.size === 0) return [];
  const out = [];
  for (const [tabKey, rec] of agentTabs) {
    out.push({
      tabKey,
      active: rec.active,
      openedAt: rec.openedAt,
      url: rec.page.url(),
      title: await boundedTitle(rec.page),
    });
  }
  return out;
}

export function allAgents() {
  return [...TABS.keys()];
}

export function closeAll() {
  const pages = [];
  for (const agentTabs of TABS.values()) {
    for (const [, rec] of agentTabs) pages.push(rec.page);
  }
  TABS.clear();
  return Promise.allSettled(pages.map((p) => p.close().catch(() => {})));
}

export function tabsSummary() {
  return [...TABS.entries()].map(([agent, m]) => ({ agent, tabs: m.size, keys: [...m.keys()] }));
}
