import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { access, readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bootstrap = await readFile(new URL('../src/public/panel-theme.js', import.meta.url), 'utf8');
const panelHTML = await readFile(new URL('../src/entrypoints/sidepanel/index.html', import.meta.url), 'utf8');

function runBootstrap(cached, blockCache = false) {
  const styles = {}, listeners = [];
  let resolveRead;
  const storageRead = new Promise(resolve => { resolveRead = resolve; });
  vm.runInNewContext(bootstrap, {
    document: { documentElement: { style: { setProperty: (key, value) => { styles[key] = value; } } } },
    localStorage: {
      getItem: () => { if (blockCache) throw new Error('Unavailable'); return cached; },
      setItem: (_key, value) => { if (blockCache) throw new Error('Unavailable'); cached = value; },
    },
    chrome: { storage: {
      local: { get: () => storageRead },
      onChanged: { addListener: fn => listeners.push(fn) },
    } },
  });
  return { styles, resolveRead, cache: () => cached,
    change(theme) { for (const fn of listeners) fn({ THEME: { newValue: theme } }, 'local'); } };
}

test('panel bootstrap applies cached dark or light synchronously before storage resolves', () => {
  assert.equal(runBootstrap('dark').styles['--sz-panel-background'], '#1c1d26');
  assert.equal(runBootstrap('light').styles['--sz-panel-background'], '#ffffff');
});

test('an uncached or inaccessible cache starts dark while waiting for the app preference', async () => {
  for (const fixture of [runBootstrap(null), runBootstrap(null, true)]) {
    assert.equal(fixture.styles['--sz-panel-background'], '#1c1d26');
    fixture.resolveRead({ THEME: 'dark' });
    await new Promise(setImmediate);
    assert.equal(fixture.styles['--sz-panel-background'], '#1c1d26');
  }
});

test('a stale initial theme read cannot overwrite a newer setting or its next-open cache', async () => {
  const fixture = runBootstrap('light');
  fixture.change('dark');
  fixture.resolveRead({ THEME: 'light' });
  await new Promise(setImmediate);
  assert.equal(fixture.styles['--sz-panel-background'], '#1c1d26');
  assert.equal(fixture.cache(), 'dark');
  fixture.change('light');
  assert.equal(fixture.styles['--sz-panel-background'], '#ffffff');
  assert.equal(fixture.cache(), 'light');
});

test('missing or removed preferences still use the existing light app default', async () => {
  const fixture = runBootstrap(null);
  fixture.resolveRead({});
  await new Promise(setImmediate);
  assert.equal(fixture.styles['--sz-panel-background'], '#ffffff');
  fixture.change('dark');
  fixture.change(undefined);
  assert.equal(fixture.styles['--sz-panel-background'], '#ffffff');
});

const candidates = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
let chrome;
for (const path of candidates) {
  try { await access(path); chrome = path; break; } catch { /* Try the next install. */ }
}

const browserTest = `
import React, { Suspense, act, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import { themeAtom, useThemeValue } from './src/hooks/layout';
import EmptyPage from './src/components/Loader/EmptyPage';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const host = document.getElementById('root');
const store = createStore();
const frames = [];
const color = theme => theme === 'dark' ? 'rgb(28, 29, 38)' : 'rgb(255, 255, 255)';
const background = element => getComputedStyle(element).backgroundColor;
const assertDocumentTheme = theme => {
  for (const element of [document.documentElement, document.body, host]) {
    check(background(element) === color(theme), element.tagName + ' has wrong background: ' + background(element));
  }
  check(getComputedStyle(document.documentElement).colorScheme === theme, 'Wrong browser color scheme');
};
function Probe() {
  const theme = useThemeValue();
  useLayoutEffect(() => { frames.push(theme); }, [theme]);
  return React.createElement('div', { id: 'probe', style: { background: color(theme) } }, theme);
}
async function run() {
  assertDocumentTheme(fixture.theme);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Provider, { store },
    React.createElement(Suspense, { fallback: React.createElement(EmptyPage) }, React.createElement(Probe)))));
  check(frames.length === 0, 'Default theme rendered before the stored theme was ready');
  const loading = host.querySelector('[aria-busy]');
  check(loading && background(loading) === color(fixture.theme), 'Loading fallback flashed a different background');
  check(loading.getBoundingClientRect().height >= innerHeight, 'Loading background does not fill the panel');
  assertDocumentTheme(fixture.theme);
  await act(async () => { fixture.waiting = false; fixture.reads.splice(0).forEach(resolve => resolve()); });
  check(frames.length > 0 && frames.every(theme => theme === fixture.theme), 'Hydration committed the wrong theme');
  assertDocumentTheme(fixture.theme);
  const next = fixture.theme === 'dark' ? 'light' : 'dark';
  await act(async () => { await store.set(themeAtom, next); });
  assertDocumentTheme(next);
  check(document.getElementById('probe').textContent === next, 'Setting did not update the UI theme');
  check(localStorage.getItem('shizue.panel.theme') === next, 'Next-open cache did not follow the setting');
  await act(async () => root.unmount());
  document.body.dataset.result = 'passed';
}
run().catch(error => {
  document.body.dataset.result = 'failed';
  document.getElementById('result').textContent = error.stack;
});
`;

for (const cached of ['dark', null, 'light']) {
  test(`Chrome keeps the panel background consistent before React, during loading and after hydration (cache=${cached})`,
    { skip: !chrome && 'Chrome unavailable; set CHROME_BIN', timeout: 60000 }, async () => {
      const directory = await mkdtemp(join(tmpdir(), 'shizue-panel-theme-'));
      try {
        const theme = cached === 'light' ? 'light' : 'dark';
        const fixture = `
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.fixture = { theme: ${JSON.stringify(theme)}, waiting: true, reads: [], listeners: new Set() };
localStorage.removeItem('shizue.panel.theme');
${cached ? `localStorage.setItem('shizue.panel.theme', ${JSON.stringify(cached)});` : ''}
globalThis.chrome = { storage: {
  local: {
    get: async key => {
      if (key !== 'THEME') return {};
      const snapshot = fixture.theme;
      if (fixture.waiting) await new Promise(resolve => fixture.reads.push(resolve));
      return { THEME: snapshot };
    },
    set: async values => {
      fixture.theme = values.THEME;
      for (const fn of fixture.listeners) fn({ THEME: { newValue: values.THEME } }, 'local');
    },
  },
  onChanged: { addListener: fn => fixture.listeners.add(fn), removeListener: fn => fixture.listeners.delete(fn) },
} };
`;
        const result = await build({ stdin: { contents: browserTest, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'tsx' },
          bundle: true, platform: 'browser', format: 'iife', write: false, logLevel: 'silent',
          define: { 'process.env.NODE_ENV': '"development"' },
        });
        await Promise.all([
          writeFile(join(directory, 'fixture.js'), fixture),
          writeFile(join(directory, 'panel-theme.js'), bootstrap),
          writeFile(join(directory, 'test.js'), result.outputFiles[0].text),
        ]);
        const html = join(directory, 'test.html');
        await writeFile(html, panelHTML
          .replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="script-src 'self'; object-src 'self'">`)
          .replace('<script src="/panel-theme.js"></script>', '<script src="fixture.js"></script><script src="panel-theme.js"></script>')
          .replace('<script type="module" src="./main.tsx"></script>', '<pre id="result"></pre><script src="test.js"></script>'));
        const { stdout } = await promisify(execFile)(chrome, ['--headless=new', '--disable-gpu', '--no-first-run',
          '--no-default-browser-check', '--disable-background-networking', '--user-data-dir=' + join(directory, 'profile'),
          '--dump-dom', '--virtual-time-budget=10000', pathToFileURL(html).href], { timeout: 45000, maxBuffer: 1024 * 1024 });
        assert.match(stdout, /data-result="passed"/, stdout);
      } finally {
        await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    });
}
