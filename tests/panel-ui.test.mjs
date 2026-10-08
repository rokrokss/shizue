import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { access, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// No browser package is required. Set CHROME_BIN on hosts with a custom install.
const candidates = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
let chrome;
for (const path of candidates) {
  try { await access(path); chrome = path; break; } catch { /* Try the next install. */ }
}

const prelude = `
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.fixture = {
  state: { actionType: 'askForSummary', threadId: 'saved', summaryTitle: 'Page', summaryText: 'Body' },
  holdReads: true, reads: [], listeners: new Set(), messageListeners: new Set(),
  summaryReady: false, gates: [], holdAdds: true, adds: [], loads: [], frames: [], streams: [], created: 0,
};
globalThis.chrome = {
  storage: {
    local: {
      get: async key => {
        const value = { [key]: structuredClone(fixture.state) };
        if (fixture.holdReads) await new Promise(resolve => fixture.reads.push(resolve));
        return value;
      },
      set: async values => {
        const oldValue = fixture.state;
        fixture.state = values.GLOBAL_STATE;
        for (const fn of fixture.listeners) fn({ GLOBAL_STATE: { oldValue, newValue: fixture.state } }, 'local');
      },
    },
    onChanged: { addListener: fn => fixture.listeners.add(fn), removeListener: fn => fixture.listeners.delete(fn) },
  },
  runtime: {
    onMessage: { addListener: fn => fixture.messageListeners.add(fn), removeListener: fn => fixture.messageListeners.delete(fn) },
    sendMessage: async message => {
      if (message.action === 'wait_panel_summary') {
        if (!fixture.summaryReady) await new Promise(resolve => fixture.gates.push(resolve));
        return { status: 'success' };
      }
      if (message.action === 'action_load_thread') {
        const snapshot = structuredClone(fixture.rows.get(message.threadId) ?? []);
        return new Promise(resolve => fixture.loads.push({ id: message.threadId, resolve: () => resolve(snapshot) }));
      }
      throw new Error('Unexpected message ' + message.action);
    },
  },
};
`;

const stubs = {
  '@/components/Chat/ChatContainer': `import React, { useLayoutEffect } from 'react';
    export default function Messages({ messages }) {
      const text = messages.map(m => m.content).join('|');
      useLayoutEffect(() => { fixture.frames.push(text); }, [text]);
      return React.createElement('div', { 'data-messages': true }, text);
    }`,
  '@/components/Chat/ChatInput': 'export default props => { fixture.input = props; return null; };',
  '@/components/Chat/ChatGreeting': `import React from 'react'; export default () => React.createElement('div', null, 'GREETING');`,
  '@/components/Loader/DotCycle': `import React from 'react'; export const DotCycle = () => React.createElement('span', null, 'LOADING THREAD');`,
  '@/hooks/layout': `export const useThemeValue = () => 'light';`,
  '@/hooks/language': `export const useTranslateTargetLanguageValue = () => 'en';`,
  'react-i18next': `const t = key => key; export const useTranslation = () => ({ t });`,
  'react-router-dom': `const navigate = path => { fixture.navigation = path; }; export const useNavigate = () => navigate;`,
  '@/hooks/chat': `import { atom } from 'jotai';
    export const chatStatusAtom = atom('idle');
    export const isChatIdle = status => status === 'idle';
    export const isChatWaiting = status => status === 'waiting';
    export const createThreadMessageCountAtom = id => fixture.countAtom(id);`,
  '@/hooks/portStream': 'export const useChromePortStream = () => fixture.stream;',
  '@/lib/indexDB': `export const createThread = async () => { fixture.created++; return 'created'; };
    export const addMessage = async message => {
      if (fixture.holdAdds) await new Promise(resolve => fixture.adds.push(resolve));
      const rows = [...(fixture.rows.get(message.threadId) ?? []), message];
      fixture.rows.set(message.threadId, rows);
      fixture.store.set(fixture.countAtom(message.threadId), rows.length);
    };
    export const touchThread = async () => {};`,
  '@/lib/imageUtils': 'export const convertFilesToBase64Array = async () => [];',
  '@/lib/prompts': `export const getSummarizePageTextPrompt = title => 'SUMMARY ' + title;
    export const getSelectionActionPrompt = () => 'SELECTION';`,
  '@/services/chatService': 'export const chatService = { cancelNotStartedMessage: async () => {} };',
};
for (const path of ['@/components/Chat/ThreadListModalContent', '@/components/Chat/TokenUsageModalContent',
  '@/components/Chat/TopRightMenu', '@/components/Modal/SidePanelFullModal', '@/components/Setting/SettingsModalContent']) {
  stubs[path] = 'export default () => null;';
}

const browserTest = `
import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider, atom, createStore } from 'jotai';
import SidePanelProvider from './src/providers/SidePanelProvider';
import Chat from './src/components/Chat';
import { threadIdAtom } from './src/hooks/global';
import { chatStatusAtom } from '@/hooks/chat';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const flush = async fn => { await act(async () => { await fn?.(); await new Promise(resolve => setTimeout(resolve, 0)); }); };
const ai = content => ({ role: 'ai', actionType: 'chat', content, done: true });
const humanSummary = { role: 'human', actionType: 'askForSummary', content: 'STALE SUMMARY', done: true };
const host = document.getElementById('root');
const counts = new Map();
fixture.rows = new Map([['saved', [ai('SAVED CHAT')]]]);
fixture.countAtom = id => {
  if (!counts.has(id)) counts.set(id, atom(fixture.rows.get(id)?.length ?? 0));
  return counts.get(id);
};
fixture.stream = {
  startStream: payload => fixture.streams.push(payload),
  startRetryStream: payload => fixture.streams.push(payload),
  cancelStream() {},
};
const resolveLoads = id => {
  const ready = fixture.loads.filter(request => request.id === id);
  fixture.loads = fixture.loads.filter(request => request.id !== id);
  for (const request of ready) request.resolve();
};

async function run() {
  let root = createRoot(host);
  fixture.store = createStore();
  await flush(() => root.render(React.createElement(StrictMode, null,
    React.createElement(Provider, { store: fixture.store },
      React.createElement(SidePanelProvider, { loadingComponent: 'INITIALIZING' }, React.createElement(Chat))))));
  check(host.textContent === 'INITIALIZING', 'Chat appeared before storage hydration');
  check(fixture.loads.length === 0, 'A thread loaded before hydration');
  await flush(() => { fixture.holdReads = false; fixture.reads.splice(0).forEach(resolve => resolve()); });
  check(host.textContent === 'INITIALIZING', 'Chat appeared before summary delivery');
  check(fixture.gates.length > 0, 'Panel never waited for summary delivery');
  await flush(() => { fixture.summaryReady = true; fixture.gates.splice(0).forEach(resolve => resolve()); });
  check(fixture.adds.length === 1, 'Summary was duplicated or was not processed');
  check(host.textContent === 'INITIALIZING', 'Chat appeared before summary message was saved');
  await flush(() => { fixture.holdAdds = false; fixture.adds.splice(0).forEach(resolve => resolve()); });
  check(fixture.created === 0, 'Hydration created a different thread');
  check(fixture.loads.length > 0 && fixture.loads.every(load => load.id === 'saved'), 'Wrong thread loaded');
  await flush(() => resolveLoads('saved'));
  check(fixture.frames.length > 0 && fixture.frames.every(frame => frame.includes('SUMMARY Page')), 'Previous chat flashed before the summary');
  check(fixture.streams.length === 1 && fixture.streams[0].threadId === 'saved', 'Summary stream duplicated or used the wrong thread');
  await flush(() => root.unmount());

  // Mount the real Chat component with an existing conversation, then switch
  // while two old reads are in flight. Resolve one before and one after B.
  fixture.state = { actionType: 'chat', threadId: 'A' };
  fixture.rows = new Map([['A', [ai('A CONTENT')]], ['B', [ai('B CONTENT')]]]);
  fixture.frames = []; fixture.loads = []; fixture.streams = []; counts.clear();
  fixture.store = createStore();
  root = createRoot(host);
  await flush(() => root.render(React.createElement(StrictMode, null,
    React.createElement(Provider, { store: fixture.store },
      React.createElement(SidePanelProvider, { loadingComponent: 'INITIALIZING' }, React.createElement(Chat))))));
  await flush(() => resolveLoads('A'));
  check(host.textContent.includes('A CONTENT'), 'Initial chat did not load');
  fixture.rows.set('A', [humanSummary]);
  await flush(() => fixture.store.set(fixture.countAtom('A'), 2));
  await flush(() => fixture.store.set(fixture.countAtom('A'), 3));
  const stale = fixture.loads.splice(0);
  check(stale.length === 2, 'New refresh was dropped behind an old read');
  await flush(() => fixture.store.set(threadIdAtom, 'B'));
  check(!host.textContent.includes('A CONTENT'), 'Old chat remained visible under the new selection');
  await flush(() => stale[0].resolve());
  check(!host.textContent.includes('STALE SUMMARY'), 'Old response flashed before new response');
  await flush(() => resolveLoads('B'));
  check(host.textContent.includes('B CONTENT'), 'New chat was not loaded');
  await flush(() => stale[1].resolve());
  check(host.textContent.includes('B CONTENT') && !host.textContent.includes('STALE SUMMARY'), 'Late old response replaced the new chat');
  check(fixture.streams.length === 0, 'An obsolete summary started a stream');

  await flush(() => fixture.store.set(fixture.countAtom('B'), 2));
  await flush(() => fixture.input.onNewChat());
  await flush(() => resolveLoads('B'));
  check(host.textContent.includes('GREETING') && !host.textContent.includes('B CONTENT'), 'A cleared chat reappeared');

  await flush(() => fixture.store.set(threadIdAtom, 'A'));
  await flush(() => root.unmount());
  await flush(() => resolveLoads('A'));
  check(fixture.streams.length === 0, 'An unmounted chat started a summary stream');
  check(fixture.store.get(chatStatusAtom) === 'idle', 'Stale response changed chat status');
  document.body.dataset.result = 'passed';
  document.getElementById('result').textContent = 'PASS: hydration, summary preparation, StrictMode, selection rendering, stale replies, clearing, unmount';
}
run().catch(error => {
  document.body.dataset.result = 'failed';
  document.getElementById('result').textContent = error.stack;
});
`;

test('React panel renders only the selected chat through delayed hydration and out-of-order replies',
  { skip: !chrome && 'Chrome unavailable; set CHROME_BIN', timeout: 60000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shizue-panel-ui-'));
    try {
      const result = await build({ stdin: { contents: browserTest, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'tsx' },
        bundle: true, platform: 'browser', format: 'iife', write: false, logLevel: 'silent',
        banner: { js: prelude }, define: { 'process.env.NODE_ENV': '"development"' },
        plugins: [{ name: 'fixture', setup(builder) {
          builder.onResolve({ filter: /.*/ }, ({ path }) => path in stubs ? { path, namespace: 'fixture' } : undefined);
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: stubs[path], loader: 'tsx',
            resolveDir: fileURLToPath(new URL('..', import.meta.url)) }));
        } }],
      });
      await writeFile(join(directory, 'test.js'), result.outputFiles[0].text);
      const html = join(directory, 'test.html');
      await writeFile(html, '<!doctype html><html><body><div id="root"></div><pre id="result">RUNNING</pre><script src="test.js"></script></body></html>');
      const { stdout } = await promisify(execFile)(chrome, ['--headless=new', '--disable-gpu', '--no-first-run',
        '--no-default-browser-check', '--disable-background-networking', '--user-data-dir=' + join(directory, 'profile'),
        '--dump-dom', '--virtual-time-budget=10000', pathToFileURL(html).href], { timeout: 45000, maxBuffer: 1024 * 1024 });
      assert.match(stdout, /data-result="passed"/, stdout);
    } finally {
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
