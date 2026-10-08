import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run after pnpm build. Uses the production UI, a separate Chrome profile and
// simulated extension APIs. OPEN_DELAY=0 exercises a click before idle preload.
const base = fileURLToPath(new URL('../dist/chrome-mv3', import.meta.url));
const openDelay = Number(process.env.OPEN_DELAY ?? 500);
const storageDelay = Number(process.env.STORAGE_DELAY ?? 20);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixture = `
const stored = {
  THEME: 'dark', LANGUAGE: 'Korean_한국어', OPENAI_KEY: 'test-fixture',
  OPENAI_VALIDATED: true, GLOBAL_STATE: { actionType: 'chat' },
};
const subscribers = new Set();
window.storageReads = [];
const events = () => ({ addListener() {}, removeListener() {} });
chrome.storage = {
  local: {
    get: async key => {
      storageReads.push(key);
      const snapshot = key in stored ? { [key]: stored[key] } : {};
      await new Promise(resolve => setTimeout(resolve, ${storageDelay}));
      return snapshot;
    },
    set: async values => {
      const changes = {};
      for (const [key, value] of Object.entries(values)) {
        changes[key] = { oldValue: stored[key], newValue: value };
        stored[key] = value;
      }
      for (const fn of subscribers) fn(changes, 'local');
    },
  },
  onChanged: { addListener: fn => subscribers.add(fn), removeListener: fn => subscribers.delete(fn) },
};
chrome.i18n = { getUILanguage: () => 'ko' };
chrome.runtime = { onMessage: events(), sendMessage: async () => ({ status: 'success' }), getURL: path => '/' + path };
localStorage.setItem('shizue.panel.theme', 'dark');
window.smokeErrors = [];
window.addEventListener('error', e => smokeErrors.push(e.message));
window.addEventListener('unhandledrejection', e => smokeErrors.push(String(e.reason)));
`;
const mimeTypes = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    let content = path === '/fixture.js' ? fixture : await readFile(base + path);
    if (path === '/sidepanel.html') {
      content = content.toString().replace('<head>', '<head><script src="/fixture.js"></script>');
    }
    res.setHeader('Content-Type', mimeTypes[extname(path)] ?? 'application/octet-stream');
    res.end(content);
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = await mkdtemp(join(tmpdir(), 'shizue-settings-browser-'));
const browser = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--user-data-dir=' + profile, '--remote-debugging-port=0', 'about:blank',
], { stdio: 'ignore' });
let socket;
try {
  let port;
  for (let n = 0; n < 100; n++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
    catch { await delay(50); }
  }
  if (!port) throw Error('Chrome did not start; set CHROME_BIN if needed');
  const url = `http://127.0.0.1:${server.address().port}/sidepanel.html`;
  const page = await fetch(`http://127.0.0.1:${port}/json/new?${url}`, { method: 'PUT' }).then(r => r.json());
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let serial = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const reply = JSON.parse(event.data);
    if (reply.id) { pending.get(reply.id)?.(reply); pending.delete(reply.id); }
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, reply => reply.error ? reject(Error(JSON.stringify(reply.error))) : resolve(reply.result));
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw Error(result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails));
    }
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let n = 0; n < 100; n++) { if (await evaluate(expression)) return; await delay(50); }
    throw Error('Timed out: ' + expression + ' ' + await evaluate('JSON.stringify(smokeErrors)'));
  };
  await command('Emulation.setDeviceMetricsOverride', { width: 420, height: 800, deviceScaleFactor: 1, mobile: false });
  await waitFor('Boolean(document.querySelector(".sz-chat-input textarea"))');
  await delay(openDelay);
  const report = [];
  for (let attempt = 1; attempt <= 5; attempt++) {
    report.push(await evaluate(`(async () => {
      const start = performance.now(), readStart = storageReads.length;
      const resourcesStart = performance.getEntriesByType('resource').length;
      const samples = [];
      document.querySelector('[aria-label="setting"]').closest('button').click();
      while (performance.now() - start < 1000) {
        await new Promise(requestAnimationFrame);
        const busy = [...document.querySelectorAll('[aria-busy="true"]')].some(e => e.getClientRects().length > 0);
        const visible = [...document.querySelectorAll('[role="tab"]')].some(e => e.getClientRects().length > 0);
        samples.push({ time: performance.now() - start, busy, visible });
      }
      const firstVisible = samples.find(s => s.visible)?.time;
      const lastBusy = samples.filter(s => s.busy).at(-1)?.time ?? 0;
      const stableVisible = samples.find(s => s.time > lastBusy && s.visible)?.time;
      const chunks = performance.getEntriesByType('resource').slice(resourcesStart)
        .filter(r => r.name.includes('/chunks/')).map(r => r.name.split('/').pop());
      return {
        firstVisibleMs: Math.round(firstVisible ?? -1), stableVisibleMs: Math.round(stableVisible ?? -1),
        loadingFrames: samples.filter(s => s.busy).length, reads: storageReads.slice(readStart), chunks,
      };
    })()`));
    await evaluate(`([...document.querySelectorAll('button')].find(b => b.textContent.trim() === '✕')).click()`);
    await delay(100);
  }
  // Changing a setting in another extension context while this screen is closed
  // must reach the reopened UI, even though it does not read Chrome storage again.
  await evaluate(`chrome.storage.local.set({ SHOW_TOGGLE: false })`);
  await evaluate(`document.querySelector('[aria-label="setting"]').closest('button').click()`);
  await waitFor(`Boolean(document.querySelector('[role="tab"]'))`);
  await evaluate(`[...document.querySelectorAll('[role="tab"]')].find(t => t.textContent === '레이아웃').click()`);
  await waitFor(`Boolean(document.querySelector('[role="tabpanel"] input[type="checkbox"]'))`);
  assert.equal(await evaluate(`document.querySelector('[role="tabpanel"] input[type="checkbox"]').checked`), true,
    'Settings ignored an external storage update received while closed');
  const errors = await evaluate('smokeErrors');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ storageDelay, openDelay, report, externalChangeApplied: true }, null, 2));
  for (const attempt of report) assert.ok(attempt.stableVisibleMs >= 0, 'Settings never appeared');
  for (const attempt of report.slice(1)) {
    assert.equal(attempt.loadingFrames, 0, 'Reopening settings showed a loading frame');
    assert.deepEqual(attempt.reads, [], 'Reopening settings read storage again');
    assert.deepEqual(attempt.chunks, [], 'Reopening settings downloaded code again');
  }
} finally {
  socket?.close();
  browser.kill();
  server.close();
  await delay(150);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
