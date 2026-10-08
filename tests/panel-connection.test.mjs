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
    '@/lib/indexDB': 'export const db = {}; export const getLatestMessageForThread = async () => null; export const loadThread = async () => [];',
    '@/services/background/translationHandler': 'export const getTranslationHandler = () => ({});',
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
    '@/entrypoints/background/sidepanel': 'export const openPanel = async () => globalThis.recordPanelOpen();',
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
