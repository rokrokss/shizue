import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { unlink } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

async function withModule(chrome, run, entry = '../src/services/background/contentScriptRecovery.ts') {
  const temporary = fileURLToPath(new URL(`../.wxt/recovery-${randomUUID()}.mjs`, import.meta.url));
  const previous = globalThis.chrome;
  globalThis.chrome = chrome;
  try {
    await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], outfile: temporary, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
    await run(await import(pathToFileURL(temporary).href));
  } finally { globalThis.chrome = previous; await unlink(temporary); }
}

function event() {
  const listeners = new Set();
  return { listeners, addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn), emit: (...args) => [...listeners].forEach(fn => fn(...args)) };
}
function fixture(url = 'https://example.test/article') {
  const tab = { id: 7, url, discarded: false, frozen: false };
  const alive = new Set(), calls = [], session = {};
  const chrome = {
    runtime: { id: 'fixture-extension', onInstalled: event(), onStartup: event(), onMessage: event() },
    permissions: { onAdded: event() },
    storage: { session: {
      get: async () => ({ ...session }), set: async updates => Object.assign(session, updates),
    } },
    tabs: {
      get: async () => ({ ...tab }), query: async () => { calls.push(['query']); return [{ ...tab }]; },
      onActivated: event(), onUpdated: event(),
      sendMessage: async (id, message, target) => {
        calls.push(['ping', id, message.script, target]);
        if (!alive.has(message.script)) throw new Error('Could not establish connection. Receiving end does not exist.');
        return { alive: true, script: message.script };
      },
    },
    scripting: {
      insertCSS: async options => { calls.push(['css', options]); },
      executeScript: async options => {
        calls.push(['execute', options]);
        if (options.files) {
          for (const file of options.files) alive.add(file.replace('content-scripts/', '').replace('.js', ''));
          return [{ documentId: 'document-7', frameId: 0 }];
        }
        return [{ documentId: 'document-7', frameId: 0, result: tab.url }];
      },
    },
  };
  return { chrome, tab, alive, calls, session, injected: () => calls.filter(([kind, options]) => kind === 'execute' && options.files).flatMap(([, options]) => options.files) };
}

test('only supported web pages receive their matching scripts', async () => {
  await withModule({}, async ({ scriptsForPage }) => {
    assert.deepEqual(scriptsForPage('https://example.test'), ['toggle']);
    assert.deepEqual(scriptsForPage('https://www.youtube.com/watch?v=example'), ['toggle', 'youtube-caption-toggle']);
    assert.deepEqual(scriptsForPage('http://www.youtube.com/'), ['toggle']);
    for (const url of [undefined, '', 'invalid', 'chrome://settings', 'chrome-extension://id/page.html', 'file:///tmp/page.html', 'https://chromewebstore.google.com/detail/example', 'https://chrome.google.com/webstore/detail/example']) assert.deepEqual(scriptsForPage(url), []);
  });
});

test('healthy scripts are kept without reinjection or stylesheet changes', async () => {
  const f = fixture(); f.alive.add('toggle');
  await withModule(f.chrome, async ({ recoverTabContentScripts }) => {
    assert.equal(await recoverTabContentScripts(7), true);
    assert.deepEqual(f.injected(), []);
    assert.equal(f.calls.some(([kind]) => kind === 'execute' || kind === 'css'), false);
  });
});

test('a disconnected tab is restored in place with document-pinned scripts and fonts', async () => {
  const f = fixture();
  await withModule(f.chrome, async ({ recoverTabContentScripts }) => {
    assert.equal(await recoverTabContentScripts(7), true);
    assert.deepEqual(f.injected(), ['content-scripts/toggle.js']);
    const mutations = f.calls.filter(([kind, options]) => kind === 'css' || (kind === 'execute' && options.files));
    assert.equal(mutations[0][0], 'css');
    for (const [, options] of mutations) assert.deepEqual(options.target, { tabId: 7, documentIds: ['document-7'] });
    // The fixture deliberately has no tabs.reload API; recovery must preserve the page.
    assert.equal(await recoverTabContentScripts(7), true);
    assert.equal(f.injected().length, 1);
  });
});

test('YouTube recovery replaces only the missing script', async () => {
  const f = fixture('https://www.youtube.com/watch?v=test'); f.alive.add('toggle');
  await withModule(f.chrome, async ({ recoverTabContentScripts }) => {
    assert.equal(await recoverTabContentScripts(7), true);
    assert.deepEqual(f.injected(), ['content-scripts/youtube-caption-toggle.js']);
  });
});

test('concurrent activation and summary recovery share one injection', async () => {
  const f = fixture();
  await withModule(f.chrome, async ({ recoverTabContentScripts }) => {
    const a = recoverTabContentScripts(7), b = recoverTabContentScripts(7);
    assert.equal(a, b);
    assert.deepEqual(await Promise.all([a, b]), [true, true]);
    assert.equal(f.injected().length, 1);
  });
});

test('navigation during recovery does not inject code into a different document', async () => {
  const f = fixture('https://www.youtube.com/watch?v=test');
  f.chrome.scripting.executeScript = async () => [{ documentId: 'new-doc', frameId: 0, result: 'https://example.test' }];
  await withModule(f.chrome, async ({ recoverTabContentScripts }) => {
    assert.equal(await recoverTabContentScripts(7), false);
    assert.equal(f.calls.some(([kind]) => kind === 'css'), false);
    assert.deepEqual(f.injected(), []);
  });
});

test('a declarative script starting during the probe is not injected twice', async () => {
  const f = fixture();
  const original = f.chrome.scripting.executeScript;
  f.chrome.scripting.executeScript = async options => { if (options.func) f.alive.add('toggle'); return original(options); };
  await withModule(f.chrome, async ({ recoverTabContentScripts }) => {
    assert.equal(await recoverTabContentScripts(7), true);
    assert.deepEqual(f.injected(), []);
  });
});

for (const property of ['discarded', 'frozen']) {
  test(`${property} tabs are left asleep`, async () => {
    const f = fixture(); f.tab[property] = true;
    await withModule(f.chrome, async ({ recoverTabContentScripts }) => {
      assert.equal(await recoverTabContentScripts(7), false);
      assert.equal(f.calls.length, 0);
    });
  });
}

test('withheld permissions and closed tabs fail cleanly and can recover later', async () => {
  const f = fixture(); const original = f.chrome.scripting.executeScript;
  f.chrome.scripting.executeScript = async () => { throw new Error('Cannot access contents of the page.'); };
  await withModule(f.chrome, async ({ recoverTabContentScripts }) => {
    assert.equal(await recoverTabContentScripts(7), false);
    f.chrome.scripting.executeScript = original;
    assert.equal(await recoverTabContentScripts(7), true);
    f.chrome.tabs.get = async () => { throw new Error('No tab with id: 7.'); };
    assert.equal(await recoverTabContentScripts(7), false);
  });
});

test('initial scan runs once per extension session and again after a reload', async () => {
  const f = fixture();
  await withModule(f.chrome, async ({ recoverInitialTabs }) => {
    const first = recoverInitialTabs(), second = recoverInitialTabs();
    assert.equal(first, second);
    await first;
    await recoverInitialTabs();
    assert.equal(f.calls.filter(([kind]) => kind === 'query').length, 1);
  });
  // A sleeping worker restarts while session storage and page connections survive.
  await withModule(f.chrome, async ({ recoverInitialTabs }) => { await recoverInitialTabs(); });
  assert.equal(f.calls.filter(([kind]) => kind === 'query').length, 1);
  // Chrome clears session storage and invalidates page connections on extension reload.
  delete f.session.CONTENT_SCRIPTS_RECOVERED; f.alive.clear();
  await withModule(f.chrome, async ({ recoverInitialTabs }) => { await recoverInitialTabs(); });
  assert.equal(f.calls.filter(([kind]) => kind === 'query').length, 2);
  assert.equal(f.injected().length, 2);
});

test('lifecycle listeners register before startup scanning and restore resumed tabs', async () => {
  const f = fixture(); f.session.CONTENT_SCRIPTS_RECOVERED = true;
  await withModule(f.chrome, async ({ contentScriptRecoveryListeners, recoverTabContentScripts }) => {
    contentScriptRecoveryListeners();
    assert.equal(f.chrome.runtime.onInstalled.listeners.size, 1);
    assert.equal(f.chrome.runtime.onStartup.listeners.size, 1);
    assert.equal(f.chrome.tabs.onActivated.listeners.size, 1);
    assert.equal(f.chrome.permissions.onAdded.listeners.size, 1);
    f.chrome.tabs.onActivated.emit({ tabId: 7 });
    assert.equal(await recoverTabContentScripts(7), true);
    f.alive.clear();
    f.chrome.tabs.onUpdated.emit(7, { frozen: false });
    assert.equal(await recoverTabContentScripts(7), true);
    assert.equal(f.injected().length, 2);
  });
});

test('a stale health listener cannot claim an invalidated context is alive', async () => {
  const f = fixture();
  await withModule(f.chrome, async ({ registerContentScriptConnection }) => {
    const remove = registerContentScriptConnection('toggle');
    const [listener] = f.chrome.runtime.onMessage.listeners;
    const replies = [];
    listener({ action: 'shizue_content_script_ping', script: 'toggle' }, {}, value => replies.push(value));
    assert.deepEqual(replies, [{ alive: true, script: 'toggle' }]);
    listener({ action: 'other', script: 'toggle' }, {}, value => replies.push(value));
    listener({ action: 'shizue_content_script_ping', script: 'youtube-caption-toggle' }, {}, value => replies.push(value));
    delete f.chrome.runtime.id;
    listener({ action: 'shizue_content_script_ping', script: 'toggle' }, {}, value => replies.push(value));
    assert.equal(replies.length, 1);
    remove(); assert.equal(f.chrome.runtime.onMessage.listeners.size, 0);
  }, '../src/lib/contentScriptConnection.ts');
});

test('startup restores active tabs first and limits parallel work', async () => {
  const f = fixture(); f.alive.add('toggle');
  f.chrome.tabs.query = async () => Array.from({ length: 8 }, (_, index) => ({ ...f.tab, id: index, active: index === 7 }));
  const started = [], release = [];
  let hold = true;
  f.chrome.tabs.get = async id => {
    started.push(id);
    if (hold) await new Promise(resolve => release.push(resolve));
    return { ...f.tab, id };
  };
  await withModule(f.chrome, async ({ recoverOpenTabs }) => {
    const scan = recoverOpenTabs();
    await Promise.resolve();
    assert.equal(started[0], 7);
    assert.equal(started.length, 4);
    hold = false; release.forEach(resolve => resolve());
    await scan;
    assert.equal(started.length, 8);
  });
});
