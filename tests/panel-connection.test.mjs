import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { unlink } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

async function withModule(entry, globals, run, stubs = {}) {
  const temporary = fileURLToPath(new URL(`../.wxt/panel-${randomUUID()}.mjs`, import.meta.url));
  const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, globals);
  try {
    await build({
      entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], outfile: temporary,
      bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent',
      plugins: [{ name: 'fixture-dependencies', setup(build) {
        build.onResolve({ filter: /.*/ }, ({ path }) => path in stubs ? { path, namespace: 'fixture' } : undefined);
        build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: stubs[path], loader: 'ts' }));
      } }],
    });
    await run(await import(pathToFileURL(temporary).href));
  } finally {
    Object.assign(globalThis, previous);
    await unlink(temporary);
  }
}

for (const failure of ['rejected', 'invalidated', 'error-reply', 'no-reply']) {
  test(`panel button reports ${failure} connection instead of an unhandled promise`, async () => {
    const chrome = { runtime: { sendMessage() {
      if (failure === 'invalidated') throw new Error('Extension context invalidated.');
      if (failure === 'rejected') return Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
      return Promise.resolve(failure === 'error-reply' ? { success: false, error: 'User gesture required' } : undefined);
    } } };
    await withModule('../src/services/panelService.ts', { chrome }, async ({ panelService }) => {
      assert.equal(await panelService.openPanel(), false);
      assert.equal(await panelService.setPanelOpenOrNot(), false);
    });
  });
}

test('panel request is sent synchronously in the click before its promise settles', async () => {
  const calls = [];
  let finish;
  const chrome = { runtime: { sendMessage(message) { calls.push(message); return new Promise((resolve) => { finish = resolve; }); } } };
  await withModule('../src/services/panelService.ts', { chrome }, async ({ panelService }) => {
    const pending = panelService.openPanel();
    assert.deepEqual(calls, [{ action: 'action_open_panel' }]);
    finish({ status: 'success' });
    assert.equal(await pending, true);
  });
});

test('summary panel intent is sent with the synchronous open request', async () => {
  const calls = [];
  const chrome = { runtime: { sendMessage(message) {
    calls.push(message);
    return Promise.resolve({ status: 'success' });
  } } };
  await withModule('../src/services/panelService.ts', { chrome }, async ({ panelService }) => {
    const pending = panelService.openPanel({ summarizePage: true });
    assert.deepEqual(calls, [{ action: 'action_open_panel', summarizePage: true }]);
    assert.equal(await pending, true);
  });
});

const panelSummaryStubs = {
  '@/entrypoints/background/sidepanel': 'export const openPanel = id => globalThis.openSummaryPanel(id);',
  '@/services/pageSummary': 'export const requestPageSummary = id => globalThis.deliverSummary(id);',
  '@/services/background/contentScriptRecovery': 'export const recoverTabContentScripts = async () => true;',
};

test('a cold panel waits for summary delivery while opening immediately in the gesture', async () => {
  const events = [];
  let finishSummary;
  await withModule('../src/services/background/panelSummary.ts', {
    openSummaryPanel: id => { events.push(['open', id]); return Promise.resolve(); },
    deliverSummary: id => { events.push(['summary', id]); return new Promise(resolve => { finishSummary = resolve; }); },
  }, async ({ openPanelForSummary, waitForPanelSummary }) => {
    const opening = openPanelForSummary(7, 2);
    assert.deepEqual(events, [['open', 2], ['summary', 7]]);
    let ready = false;
    const waiting = waitForPanelSummary().then(() => { ready = true; });
    await new Promise(setImmediate);
    assert.equal(ready, false);
    finishSummary();
    await opening;
    await waiting;
    assert.equal(ready, true);
    await waitForPanelSummary();
  }, panelSummaryStubs);
});

test('failed summary delivery releases the initial panel gate and still reports the error', async () => {
  let failSummary;
  await withModule('../src/services/background/panelSummary.ts', {
    openSummaryPanel: async () => {},
    deliverSummary: () => new Promise((_resolve, reject) => { failSummary = reject; }),
  }, async ({ openPanelForSummary, waitForPanelSummary }) => {
    const opening = assert.rejects(openPanelForSummary(7, 2), /Page unavailable/);
    const waiting = waitForPanelSummary();
    failSummary(new Error('Page unavailable'));
    await opening;
    await waiting;
    await waitForPanelSummary();
  }, panelSummaryStubs);
});

test('a summary started during initialization is included in the panel wait', async () => {
  const finish = [];
  await withModule('../src/services/background/panelSummary.ts', {
    openSummaryPanel: async () => {},
    deliverSummary: () => new Promise(resolve => { finish.push(resolve); }),
  }, async ({ openPanelForSummary, waitForPanelSummary }) => {
    const first = openPanelForSummary(7, 2);
    let ready = false;
    const waiting = waitForPanelSummary().then(() => { ready = true; });
    const second = openPanelForSummary(8, 2);
    finish[0]();
    await first;
    await new Promise(setImmediate);
    assert.equal(ready, false);
    finish[1]();
    await second;
    await waiting;
    assert.equal(ready, true);
  }, panelSummaryStubs);
});

test('background routes summary opens and panel readiness through the same handoff', async () => {
  const events = [];
  let finishSummary;
  await withModule('../src/services/background/messageHandlers.ts', {
    openSummaryPanel: id => { events.push(['open', id]); return Promise.resolve(); },
    deliverSummary: id => { events.push(['summary', id]); return new Promise(resolve => { finishSummary = resolve; }); },
  }, async ({ messageHandlers }) => {
    const replies = [];
    const opening = messageHandlers.action_open_panel({ summarizePage: true }, reply => replies.push(reply), { tab: { id: 7, windowId: 2 } });
    assert.deepEqual(events, [['open', 2], ['summary', 7]]);
    let ready = false;
    const waiting = messageHandlers.wait_panel_summary({}, () => { ready = true; });
    await new Promise(setImmediate);
    assert.equal(ready, false);
    assert.equal(replies.length, 0);
    finishSummary();
    await Promise.all([opening, waiting]);
    assert.equal(ready, true);
    assert.deepEqual(replies, [{ status: 'success' }]);
  }, {
    ...panelSummaryStubs,
    '@/entrypoints/background/sidepanel': 'export const openPanel = id => globalThis.openSummaryPanel(id); export const togglePanel = async () => {};',
    '@/lib/indexDB': 'export const db = {}; export const addWord = async () => {}; export const getLatestMessageForThread = async () => null; export const loadThread = async () => [];',
    '@/services/background/translationHandler': 'export const getTranslationHandler = () => ({});',
    '@/services/background/chatModelHandler': 'export const getChatModelHandler = () => ({});',
  });
});

function summaryFixture() {
  const listeners = new Set(), writes = [], sent = [];
  const data = { GLOBAL_STATE: { actionType: 'chat', threadId: 'existing-thread' } };
  const chrome = {
    runtime: {
      onMessage: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) },
      sendMessage: async (message) => { sent.push(message); throw new Error('Receiving end does not exist.'); },
    },
    storage: { local: {
      get: async () => structuredClone(data),
      set: async (updates) => { writes.push(updates); Object.assign(data, updates); },
    } },
    tabs: { async sendMessage(tabId, message, target) {
      sent.push({ tabId, message, target });
      return new Promise((resolve) => { for (const fn of listeners) if (fn(message, {}, resolve)) return; resolve(undefined); });
    } },
  };
  return { chrome, listeners, data, writes, sent, globals: {
    chrome, document: { title: 'Fixture page', body: { innerText: 'Page content '.repeat(10_000) } },
    window: { location: { href: 'https://example.test/page' } },
  } };
}

test('summary receiver works before React UI mounts and acknowledges only after durable storage', async () => {
  const fixture = summaryFixture();
  await withModule('../src/services/pageSummary.ts', fixture.globals, async ({ registerPageSummaryListener, requestPageSummary }) => {
    const remove = registerPageSummaryListener();
    await requestPageSummary(7);
    assert.equal(fixture.writes.length, 1);
    assert.equal(fixture.data.GLOBAL_STATE.actionType, 'askForSummary');
    assert.equal(fixture.data.GLOBAL_STATE.summaryText.length, 100_000);
    assert.equal(fixture.data.GLOBAL_STATE.summaryTitle, 'Fixture page');
    assert.equal(fixture.data.GLOBAL_STATE.threadId, 'existing-thread');
    assert.deepEqual(fixture.sent[0].target, { frameId: 0 });
    assert.equal(fixture.sent.some((message) => message.action === 'action_open_panel'), false);
    remove();
    assert.equal(fixture.listeners.size, 0);
  });
});

test('an absent content script is returned to the summary caller as an error', async () => {
  const fixture = summaryFixture();
  fixture.chrome.tabs.sendMessage = async () => { throw new Error('Could not establish connection. Receiving end does not exist.'); };
  await withModule('../src/services/pageSummary.ts', fixture.globals, async ({ requestPageSummary }) => {
    await assert.rejects(requestPageSummary(7), /Receiving end/);
    assert.equal(fixture.writes.length, 0);
  });
});

test('failed summary storage cannot be acknowledged as success', async () => {
  const fixture = summaryFixture();
  fixture.chrome.storage.local.set = async () => { throw new Error('Storage failed'); };
  await withModule('../src/services/pageSummary.ts', fixture.globals, async ({ registerPageSummaryListener, requestPageSummary }) => {
    registerPageSummaryListener();
    await assert.rejects(requestPageSummary(7), /summary receiver unavailable/);
    assert.equal(fixture.sent.some((message) => message.action === 'update_panel_init_data'), false);
  });
});

test('summary receiver leaves translation and other background messages unanswered', async () => {
  const fixture = summaryFixture();
  await withModule('../src/services/pageSummary.ts', fixture.globals, async ({ registerPageSummaryListener }) => {
    registerPageSummaryListener();
    let replied = false;
    const [listener] = fixture.listeners;
    assert.equal(listener({ action: 'translate_html_text_batch' }, {}, () => { replied = true; }), false);
    assert.equal(replied, false);
    assert.equal(fixture.writes.length, 0);
  });
});

const backgroundStubs = {
  '@/entrypoints/background/states/ready': 'export const whenBackgroundStateReady = async () => {};',
  '@/services/background/chatModelHandler': 'export const getChatModelHandler = () => ({});',
};

test('panel open errors reach the caller and toolbar opening has a single owner', async () => {
  const events = [], commands = [];
  const chrome = {
    sidePanel: { open(options) { events.push(['open', options]); return Promise.reject(new Error('User gesture required')); }, setPanelBehavior: async (options) => events.push(['behavior', options]) },
    windows: { getCurrent: (_, fn) => fn({ id: 5 }), onFocusChanged: { addListener() {} }, onCreated: { addListener() {} }, onRemoved: { addListener() {} } },
    action: { onClicked: { addListener: () => events.push(['duplicate-toolbar-listener']) } },
    commands: { onCommand: { addListener: (fn) => commands.push(fn) } },
  };
  await withModule('../src/entrypoints/background/sidepanel.ts', { chrome }, async ({ openPanel, sidebarToggleListeners }) => {
    sidebarToggleListeners();
    const pending = openPanel(12);
    assert.deepEqual(events.at(-1), ['open', { windowId: 12 }]);
    await assert.rejects(pending, /User gesture/);
    assert.equal(events.some(([name]) => name === 'duplicate-toolbar-listener'), false);
    assert.equal(commands.length, 1);
  }, backgroundStubs);
});

// Browsers without a usable side panel: Safari, Firefox, Android (Edge for Android has a broken one).
function panelTabFixture({ sidePanel } = {}) {
  const session = {}, created = [], updated = [], events = [];
  const listeners = { action: [], command: [], removed: [] };
  let nextTabId = 100;
  const tabs = new Map();
  const chrome = {
    runtime: { getURL: (path) => new URL(path, 'safari-web-extension://uuid/').href },
    storage: { session: {
      get: async (key) => (key in session ? { [key]: session[key] } : {}),
      set: async (values) => { Object.assign(session, values); },
      remove: async (key) => { delete session[key]; },
    } },
    tabs: {
      create: async ({ url }) => { const tab = { id: nextTabId++, url, windowId: 1 }; tabs.set(tab.id, tab); created.push(url); return tab; },
      get: async (id) => { if (!tabs.has(id)) throw new Error('No tab'); return tabs.get(id); },
      update: async (id, props) => { updated.push([id, props]); return tabs.get(id); },
      onRemoved: { addListener: (fn) => listeners.removed.push(fn) },
    },
    windows: { update: async () => {} },
    action: { onClicked: { addListener: (fn) => listeners.action.push(fn) } },
    commands: { onCommand: { addListener: (fn) => listeners.command.push(fn) } },
    ...(sidePanel ? { sidePanel: { setPanelBehavior: async () => events.push('setPanelBehavior'), open: async () => events.push('sidePanel.open') } } : {}),
  };
  return { chrome, session, created, updated, events, listeners, tabs };
}

async function withUserAgent(userAgent, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent }, configurable: true, writable: true });
  try { await run(); } finally { Object.defineProperty(globalThis, 'navigator', original); }
}

test('without a side panel the panel opens in one reused tab that remembers its page', async () => {
  const fixture = panelTabFixture();
  await withModule('../src/entrypoints/background/sidepanel.ts', { chrome: fixture.chrome }, async ({ panelHost, openPanel, togglePanel }) => {
    assert.equal(panelHost, 'tab');
    await openPanel(1, 7);
    assert.deepEqual(fixture.created, ['safari-web-extension://uuid/sidepanel.html?host=tab']);
    assert.equal(fixture.session.PANEL_SOURCE_TAB, 7);
    const panelTabId = fixture.session.PANEL_TAB;
    // From another page the same tab comes forward and the page is remembered.
    await togglePanel(1, 8);
    assert.equal(fixture.created.length, 1);
    assert.deepEqual(fixture.updated.at(-1), [panelTabId, { active: true }]);
    assert.equal(fixture.session.PANEL_SOURCE_TAB, 8);
    // A command fired while the panel tab itself is active keeps the page it works on.
    await openPanel(1, panelTabId);
    assert.equal(fixture.session.PANEL_SOURCE_TAB, 8);
  }, backgroundStubs);
});

test('a closed panel tab is forgotten and opened again', async () => {
  const fixture = panelTabFixture();
  await withModule('../src/entrypoints/background/sidepanel.ts', { chrome: fixture.chrome }, async ({ openPanel, sidebarToggleListeners }) => {
    sidebarToggleListeners();
    await openPanel(1, 7);
    const panelTabId = fixture.session.PANEL_TAB;
    fixture.tabs.delete(panelTabId);
    for (const fn of fixture.listeners.removed) fn(panelTabId);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(fixture.session.PANEL_TAB, undefined);
    await openPanel(1, 7);
    assert.equal(fixture.created.length, 2);
  }, backgroundStubs);
});

test('Edge for Android keeps its broken side panel untouched and opens a panel tab from the toolbar', async () => {
  const fixture = panelTabFixture({ sidePanel: true });
  await withUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36 EdgA/154.0.4258.38', async () => {
    await withModule('../src/entrypoints/background/sidepanel.ts', { chrome: fixture.chrome }, async ({ panelHost, sidebarToggleListeners }) => {
      assert.equal(panelHost, 'tab');
      sidebarToggleListeners();
      assert.deepEqual(fixture.events, []);
      assert.equal(fixture.listeners.action.length, 1);
      fixture.listeners.action[0]({ id: 9 });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(fixture.created.length, 1);
      assert.equal(fixture.session.PANEL_SOURCE_TAB, 9);
      assert.deepEqual(fixture.events, []);
    }, backgroundStubs);
  });
});

// Firefox: its sidebar opens only within a user action, so open() and toggle() fail for a request
// from the page that came without one.
function sidebarFixture({ userAction = false, open = false } = {}) {
  const fixture = panelTabFixture();
  const calls = [];
  const change = (name) => () => {
    calls.push(name);
    if (!userAction) return Promise.reject(new Error(`sidebarAction.${name} may only be called from a user input handler`));
    open = name === 'open' ? true : !open;
    return Promise.resolve();
  };
  const browser = { sidebarAction: { open: change('open'), toggle: change('toggle'), isOpen: async () => open } };
  return { ...fixture, browser, calls };
}

test('Firefox opens and closes its sidebar from the toolbar button and the shortcut', async () => {
  const fixture = sidebarFixture({ userAction: true });
  await withModule('../src/entrypoints/background/sidepanel.ts', { chrome: fixture.chrome, browser: fixture.browser }, async ({ panelHost, sidebarToggleListeners }) => {
    assert.equal(panelHost, 'sidebar');
    sidebarToggleListeners();
    // Called within the click or shortcut, before any await.
    fixture.listeners.action[0]({ id: 9 });
    assert.deepEqual(fixture.calls, ['toggle']);
    fixture.listeners.command[0]('toggle-sidepanel', { id: 9 });
    assert.deepEqual(fixture.calls, ['toggle', 'toggle']);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(fixture.created, []);
  }, backgroundStubs);
});

test('a request from the page uses an open sidebar, and opens the panel tab when the sidebar is closed', async () => {
  for (const open of [true, false]) {
    const fixture = sidebarFixture({ open });
    await withModule('../src/entrypoints/background/sidepanel.ts', { chrome: fixture.chrome, browser: fixture.browser }, async ({ openPanel, togglePanel }) => {
      await openPanel(1, 7);
      await togglePanel(1, 7);
      assert.deepEqual(fixture.calls, ['open', 'toggle']);
      if (open) {
        assert.deepEqual(fixture.created, []);
      } else {
        assert.deepEqual(fixture.created, ['safari-web-extension://uuid/sidepanel.html?host=tab']);
        assert.equal(fixture.session.PANEL_SOURCE_TAB, 7);
      }
    }, backgroundStubs);
  }
});

test('a page request that carries a user action opens the sidebar without a panel tab', async () => {
  const fixture = sidebarFixture({ userAction: true });
  await withModule('../src/entrypoints/background/sidepanel.ts', { chrome: fixture.chrome, browser: fixture.browser }, async ({ openPanel }) => {
    await openPanel(1, 7);
    assert.deepEqual(fixture.calls, ['open']);
    assert.deepEqual(fixture.created, []);
  }, backgroundStubs);
});

// Safari delivers a message posted right after runtime.connect twice.
test('a stream request delivered twice on one port runs the model once', async () => {
  const connects = [], streams = [];
  const chrome = { runtime: { onConnect: { addListener: (fn) => connects.push(fn) } } };
  await withModule('../src/entrypoints/background/sidepanel.ts', { chrome, recordStream: (threadId) => streams.push(threadId) }, async ({ sidePanelMessageListeners }) => {
    sidePanelMessageListeners();
    const port = () => {
      const messages = [];
      return { messages, name: 'stream_message_key', onDisconnect: { addListener() {} }, onMessage: { addListener: (fn) => messages.push(fn) } };
    };
    const first = port();
    connects[0](first);
    const request = { action: 'run_graph_stream', threadId: 't1', actionType: 'chat' };
    await Promise.all([first.messages[0](request), first.messages[0](request)]);
    assert.deepEqual(streams, ['t1']);
    // The next answer comes on a port of its own.
    const second = port();
    connects[0](second);
    await second.messages[0]({ ...request, threadId: 't2' });
    assert.deepEqual(streams, ['t1', 't2']);
  }, {
    ...backgroundStubs,
    '@/services/background/chatModelHandler': 'export const getChatModelHandler = () => ({ streamChat: async (threadId) => globalThis.recordStream(threadId) });',
  });
});

async function withLocation(search, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { value: { search }, configurable: true, writable: true });
  try { await run(); } finally {
    if (original) Object.defineProperty(globalThis, 'location', original); else delete globalThis.location;
  }
}

// The panel page's view of the browser: the page in tab 42 (window 2), the panel tab 9 (window 1).
function panelPageFixture({ sourceOpen = true } = {}) {
  const shown = [];
  const chrome = {
    storage: { session: { get: async (key) => (key === 'PANEL_SOURCE_TAB' ? { [key]: 42 } : {}) } },
    tabs: {
      query: async () => { throw new Error('a panel tab must not query the active tab'); },
      get: async (id) => { if (id !== 42 || !sourceOpen) throw new Error('No tab'); return { id, windowId: 2, url: 'https://example.com/' }; },
      getCurrent: async () => ({ id: 9, windowId: 1 }),
      update: async (id) => { shown.push(id); return { id, windowId: id === 42 ? 2 : 1 }; },
    },
    windows: { update: async () => {} },
  };
  return { chrome, shown };
}

test('a panel tab summarizes the page it was opened from, not itself', async () => {
  const { chrome } = panelPageFixture();
  await withLocation('?host=tab', () =>
    withModule('../src/lib/panelHost.ts', { chrome }, async ({ isPanelTab, panelPageTab, panelPageTabId }) => {
      assert.equal(isPanelTab(), true);
      assert.equal(await panelPageTabId(), 42);
      // "Attach this page" offers the same tab, with its address.
      assert.equal((await panelPageTab()).url, 'https://example.com/');
    }));
});

test('a panel tab shows its page for a capture and comes back, even when the capture fails', async () => {
  const { chrome, shown } = panelPageFixture();
  await withLocation('?host=tab', () =>
    withModule('../src/lib/panelHost.ts', { chrome }, async ({ withPageShown }) => {
      const windowId = await withPageShown(async (tab) => {
        assert.deepEqual(shown, [42]);
        return tab.windowId;
      });
      // The capture is taken of the page's window, which may not be the panel's.
      assert.equal(windowId, 2);
      assert.deepEqual(shown, [42, 9]);
      await assert.rejects(withPageShown(async () => { throw new Error('capture failed'); }), /capture failed/);
      assert.deepEqual(shown, [42, 9, 42, 9]);
    }));
});

test('a panel tab whose page was closed has nothing to attach or capture', async () => {
  const { chrome, shown } = panelPageFixture({ sourceOpen: false });
  await withLocation('?host=tab', () =>
    withModule('../src/lib/panelHost.ts', { chrome }, async ({ panelPageTab, withPageShown }) => {
      assert.equal(await panelPageTab(), undefined);
      await assert.rejects(withPageShown(async () => 'captured'), /No page available/);
      assert.deepEqual(shown, []);
    }));
});

test('beside a side panel a capture runs on the active tab without switching tabs', async () => {
  const chrome = {
    tabs: {
      query: async () => [{ id: 5, windowId: 1, url: 'https://example.com/' }],
      update: async () => { throw new Error('a side panel must not switch tabs'); },
    },
  };
  await withLocation('', () =>
    withModule('../src/lib/panelHost.ts', { chrome }, async ({ withPageShown }) => {
      assert.equal(await withPageShown(async (tab) => tab.id), 5);
    }));
});

test('a cold worker registers context-menu clicks before setup completes and opens before forwarding', async () => {
  const events = [];
  let click, finishSetup;
  const chrome = {
    runtime: {},
    contextMenus: {
      onClicked: { addListener: (fn) => { click = fn; } },
      removeAll: () => new Promise((resolve) => { finishSetup = resolve; }),
      create() {}, update: (_id, _options, done) => done(),
    },
    storage: { onChanged: { addListener() {} } },
    tabs: { sendMessage: async (_id, message) => { events.push(message.openPanel === false ? 'summary' : 'unexpected'); return { success: true }; } },
  };
  const stubs = {
    ...backgroundStubs,
    '@/entrypoints/background/sidepanel': 'export const panelHost = "sidePanel"; export const openPanel = async () => globalThis.recordPanelOpen();',
    '@/entrypoints/background/states/models': 'export const getCurrentChatModel = () => "gpt"; export const getCurrentLocalServer = () => null;',
    '#i18n': 'export const i18n = { t: (key) => key };',
  };
  await withModule('../src/entrypoints/background/contextMenu.ts', { chrome, recordPanelOpen: () => events.push('open') }, async ({ createContextMenu }) => {
    const setup = createContextMenu();
    assert.equal(typeof click, 'function');
    click({ menuItemId: 'summarizePage' }, { id: 7, windowId: 2 });
    assert.deepEqual(events, ['open', 'summary']);
    finishSetup();
    await setup;
  }, stubs);
});

test('in Firefox a menu action that opens the panel from the page opens the sidebar in the click', async () => {
  for (const panelHost of ['sidebar', 'sidePanel']) {
    const events = [];
    let click;
    const chrome = {
      runtime: {},
      contextMenus: { onClicked: { addListener: (fn) => { click = fn; } }, removeAll: async () => {}, create() {}, update: (_id, _options, done) => done() },
      storage: { onChanged: { addListener() {} } },
      tabs: { sendMessage: async (_id, message) => { events.push(message.action); return { success: true }; } },
    };
    const stubs = {
      ...backgroundStubs,
      '@/entrypoints/background/sidepanel': `export const panelHost = "${panelHost}"; export const openPanel = async (windowId, tabId) => globalThis.recordPanelOpen(windowId, tabId);`,
      '@/entrypoints/background/states/models': 'export const getCurrentChatModel = () => "gpt"; export const getCurrentLocalServer = () => null;',
      '#i18n': 'export const i18n = { t: (key) => key };',
    };
    await withModule('../src/entrypoints/background/contextMenu.ts', { chrome, recordPanelOpen: (windowId, tabId) => events.push(`open ${windowId} ${tabId}`) }, async ({ createContextMenu }) => {
      await createContextMenu();
      click({ menuItemId: 'describeImage', srcUrl: 'https://example.com/a.png' }, { id: 7, windowId: 2 });
      click({ menuItemId: 'translatePage' }, { id: 7, windowId: 2 });
      // Elsewhere the page opens the panel itself, as before.
      assert.deepEqual(events, panelHost === 'sidebar'
        ? ['open 2 7', 'context_menu_describe_image', 'context_menu_translate_page']
        : ['context_menu_describe_image', 'context_menu_translate_page']);
    }, stubs);
  }
});

test('context menu setup is skipped where the browser has no context menus', async () => {
  const chrome = { runtime: {}, storage: { onChanged: { addListener() { throw new Error('unexpected listener'); } } } };
  const stubs = {
    ...backgroundStubs,
    '@/entrypoints/background/sidepanel': 'export const panelHost = "sidePanel"; export const openPanel = async () => {};',
    '@/entrypoints/background/states/models': 'export const getCurrentChatModel = () => "gpt"; export const getCurrentLocalServer = () => null;',
    '#i18n': 'export const i18n = { t: (key) => key };',
  };
  await withModule('../src/entrypoints/background/contextMenu.ts', { chrome }, async ({ createContextMenu }) => {
    await createContextMenu();
  }, stubs);
});

test('a summary reconnects a missing receiver and retries delivery once', async () => {
  const fixture = summaryFixture();
  let sends = 0, recoveries = 0;
  fixture.chrome.tabs.sendMessage = async () => {
    sends++;
    if (sends === 1) throw new Error('Could not establish connection. Receiving end does not exist.');
    return { success: true };
  };
  await withModule('../src/services/pageSummary.ts', fixture.globals, async ({ requestPageSummary }) => {
    await requestPageSummary(7, async (id) => { assert.equal(id, 7); recoveries++; return true; });
    assert.equal(sends, 2);
    assert.equal(recoveries, 1);
  });
});

test('summary recovery is requested through the background from extension UI', async () => {
  const fixture = summaryFixture();
  let connected = false;
  fixture.chrome.tabs.sendMessage = async () => {
    if (!connected) throw new Error('Receiving end does not exist.');
    return { success: true };
  };
  fixture.chrome.runtime.sendMessage = async message => {
    assert.deepEqual(message, { action: 'shizue_recover_content_scripts', tabId: 7 });
    connected = true;
    return { success: true };
  };
  await withModule('../src/services/pageSummary.ts', fixture.globals, async ({ requestPageSummary }) => {
    await requestPageSummary(7);
    assert.equal(connected, true);
  });
});

test('a closed response channel is not retried because it may already have queued a summary', async () => {
  const fixture = summaryFixture();
  let recoveries = 0;
  fixture.chrome.tabs.sendMessage = async () => { throw new Error('The message port closed before a response was received.'); };
  await withModule('../src/services/pageSummary.ts', fixture.globals, async ({ requestPageSummary }) => {
    await assert.rejects(requestPageSummary(7, async () => { recoveries++; return true; }), /port closed/);
    assert.equal(recoveries, 0);
  });
});

test('failed reconnection does not repeatedly inject or resend summaries', async () => {
  const fixture = summaryFixture();
  let sends = 0, recoveries = 0;
  fixture.chrome.tabs.sendMessage = async () => { sends++; throw new Error('Receiving end does not exist.'); };
  await withModule('../src/services/pageSummary.ts', fixture.globals, async ({ requestPageSummary }) => {
    await assert.rejects(requestPageSummary(7, async () => { recoveries++; return false; }), /Receiving end/);
    assert.equal(sends, 1);
    assert.equal(recoveries, 1);
  });
});
