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

// The translator answers every snippet with "KO:" before it, except one that drops its placeholder.
const prelude = `
globalThis.fixture = { mode: 'bilingual', batches: [], listeners: new Set() };
fixture.setMode = (mode) => {
  const oldValue = fixture.mode;
  fixture.mode = mode;
  for (const fn of fixture.listeners) fn({ PAGE_TRANSLATION_MODE: { oldValue, newValue: mode } }, 'local');
};
globalThis.chrome = {
  storage: {
    local: { get: async (key) => ({ [key]: fixture.mode }) },
    onChanged: { addListener: (fn) => fixture.listeners.add(fn) },
  },
  runtime: {
    sendMessage: async (message) => {
      if (message.action !== 'translate_html_text_batch') return undefined;
      fixture.batches.push(message.texts);
      return {
        success: true,
        translatedTexts: message.texts.map((text) => text.startsWith('Lose') ? 'KO: lost it' : 'KO: ' + text),
      };
    },
  },
};
`;

const browserTest = `
import { getPageTranslator } from './src/lib/pageTranslator';

const check = (ok, message) => { if (!ok) throw new Error(message); };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ONLY = 'data-shizue-translation-only';

async function run() {
  document.getElementById('page').innerHTML = \`
    <p id="math" style="font-size: 16px; line-height: 24px">Let <span class="katex"><span class="katex-mathml" style="position:absolute;clip:rect(1px,1px,1px,1px);width:1px;height:1px;overflow:hidden"><math><semantics><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="base" style="display:inline-block">x squared</span></span></span> be the square of a number.</p>
    <p id="code">Call <code>useState</code> to keep the value.</p>
    <pre id="block"><code>const value = useState(0);</code></pre>
    <p id="only-formula"><span class="katex"><span class="base" style="display:inline-block">a plus b</span></span></p>
    <p id="lost">Lose <code>this</code> token please.</p>
  \`;
  const translator = getPageTranslator();
  translator.activate('Korean');
  await wait(800);
  const sent = fixture.batches.flat();

  check(sent.includes('Let {{0}} be the square of a number.'), 'Formula not sent as a placeholder: ' + JSON.stringify(sent));
  check(sent.includes('Call {{0}} to keep the value.'), 'Inline code not sent as a placeholder: ' + JSON.stringify(sent));
  check(!sent.some((text) => text.includes('const value')), 'A code block was sent');
  check(!sent.some((text) => text.includes('x^2') || text.includes('squared') || text.includes('a plus b')),
    'Formula text was sent: ' + JSON.stringify(sent));

  const math = document.getElementById('math');
  const mathTranslation = math.querySelector(':scope > shizue-translation-overlay');
  check(mathTranslation?.textContent.startsWith('KO: Let'), 'Paragraph with a formula not translated');
  check(mathTranslation.querySelector('.katex .base')?.textContent === 'x squared', 'Formula not put back');
  check(!mathTranslation.textContent.includes('{{'), 'Placeholder left in the translation');
  check(document.querySelector('#code > shizue-translation-overlay code')?.textContent === 'useState', 'Code not put back');
  check(!math.hasAttribute(ONLY), 'Bilingual mode hid the original');

  fixture.setMode('translationOnly');
  await wait(50);
  check(math.hasAttribute(ONLY), 'Switching to translation only left the original showing');
  check(getComputedStyle(math).fontSize === '0px', 'The original text still takes space');
  check(getComputedStyle(math.querySelector(':scope > .katex')).display === 'none', 'The original formula still shows');
  check(getComputedStyle(mathTranslation).fontSize === '16px', 'Translation lost its size: ' + getComputedStyle(mathTranslation).fontSize);
  check(getComputedStyle(mathTranslation).lineHeight === '24px', 'Translation lost its line height');
  // Headless virtual time doesn't run CSS transitions: read where the fade ends.
  mathTranslation.style.transition = 'none';
  check(getComputedStyle(mathTranslation).opacity === '1', 'Translation only is still faded');
  check(mathTranslation.getBoundingClientRect().height > 0, 'Translation has no height');
  check(!document.getElementById('lost').hasAttribute(ONLY), 'A translation that lost a placeholder hid its original');

  fixture.setMode('bilingual');
  await wait(50);
  check(!document.querySelector('[' + ONLY + ']'), 'Back to bilingual kept an original hidden');

  fixture.setMode('translationOnly');
  await wait(50);
  // The page drops the translation (a re-render): its original shows again.
  document.querySelector('#code > shizue-translation-overlay').remove();
  await wait(1500);
  check(!document.getElementById('code').hasAttribute(ONLY), 'An original stayed hidden after the page removed its translation');

  translator.deactivate();
  check(!document.querySelector('[' + ONLY + ']'), 'Turning translation off kept an original hidden');
  check(!document.querySelector('shizue-translation-overlay'), 'Turning translation off left a translation');
  document.body.dataset.result = 'passed';
}
run().catch((error) => {
  document.body.dataset.result = 'failed';
  document.getElementById('result').textContent = error.stack;
});
`;

test('Page translation keeps code and formulas, and shows the translation alone when asked',
  { skip: !chrome && 'Chrome unavailable; set CHROME_BIN', timeout: 60000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shizue-page-translation-'));
    try {
      const result = await build({ stdin: { contents: browserTest, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts' },
        bundle: true, platform: 'browser', format: 'iife', write: false, logLevel: 'silent',
        banner: { js: prelude }, define: { 'process.env.NODE_ENV': '"development"' } });
      await writeFile(join(directory, 'test.js'), result.outputFiles[0].text);
      const html = join(directory, 'test.html');
      await writeFile(html, '<!doctype html><html><body><div id="page"></div><pre id="result">RUNNING</pre><script src="test.js"></script></body></html>');
      const { stdout } = await promisify(execFile)(chrome, ['--headless=new', '--disable-gpu', '--no-first-run',
        '--no-default-browser-check', '--disable-background-networking', '--user-data-dir=' + join(directory, 'profile'),
        '--dump-dom', '--virtual-time-budget=10000', pathToFileURL(html).href], { timeout: 45000, maxBuffer: 1024 * 1024 });
      assert.match(stdout, /data-result="passed"/, stdout);
    } finally {
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
