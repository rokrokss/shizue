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

  // An Arabic translation reads from the right on this left-to-right page.
  fixture.setMode('bilingual');
  translator.activate('Arabic_العربية');
  await wait(800);
  const arabic = document.querySelector('#code > shizue-translation-overlay');
  check(arabic?.dir === 'rtl' && arabic.lang === 'ar', 'Arabic translation not right-to-left: ' + arabic?.outerHTML);
  check(getComputedStyle(arabic).direction === 'rtl', 'Arabic translation laid out left-to-right');
  translator.deactivate();
  document.body.dataset.result = 'passed';
}
run().catch((error) => {
  document.body.dataset.result = 'failed';
  document.getElementById('result').textContent = error.stack;
});
`;

// The real rules of two sites, on markup shaped like theirs (measured 2026-11).
const rulesTest = `
import { PageTranslator } from './src/lib/pageTranslator';
import { siteRule } from './src/lib/siteRules';

const check = (ok, message) => { if (!ok) throw new Error(message); };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Translates the page as it would be on this host. Returns the texts sent.
async function translate(host, html) {
  document.getElementById('page').innerHTML = html;
  fixture.batches = [];
  const translator = new PageTranslator(siteRule(host));
  translator.activate('Korean');
  await wait(800);
  translator.deactivate();
  return fixture.batches.flat();
}

async function run() {
  // Hacker News: the menu, a story's line and "reply" stay; a comment's bare first line goes
  // with its paragraphs.
  let sent = await translate('news.ycombinator.com', \`
    <table><tr><td><span class="pagetop"><b class="hnname"><a href="news">Hacker News</a></b><a href="newest">new</a> | <a href="ask">ask</a></span></td></tr></table>
    <table><tr><td class="subtext"><span class="subline"><span class="score">2843 points</span> by <a class="hnuser">dbreunig</a> <span class="age"><a>19 hours ago</a></span> | <a>hide</a></span></td></tr></table>
    <div class="comment"><div class="commtext c00">Please read the paper first.<p>Part of my research is in weight space learning.</p><p>Some experiments here use very small models.</p></div><div class="reply"><p><font size="1"><u><a href="reply">reply</a></u></font></p></div></div>
  \`);
  check(sent.length === 1 && sent[0].startsWith('Please read the paper first.<p>Part of my research'),
    'Hacker News comment not sent whole, or its menus sent: ' + JSON.stringify(sent));

  // The comment's translation keeps its paragraphs.
  document.getElementById('page').innerHTML = '<div class="commtext">First line.<p>Second paragraph here.</p></div>';
  const translator = new PageTranslator(siteRule('news.ycombinator.com'));
  translator.activate('Korean');
  await wait(800);
  const comment = document.querySelector('.commtext > shizue-translation-overlay');
  check(comment?.querySelectorAll('p').length === 1, 'Comment translation lost its paragraph: ' + comment?.innerHTML);
  translator.deactivate();

  // GitHub: only the title and the body, while the page has them.
  sent = await translate('github.com', \`
    <header><nav><a href="/pulls">Pull requests</a> <a href="/issues">Issues</a></nav></header>
    <h1><bdi class="markdown-title">Hooks and multiple instances of React</bdi></h1>
    <div><h3>Assignees</h3><div>No one assigned</div></div>
    <div class="markdown-body"><p>I had multiple instances of React by mistake.</p></div>
  \`);
  check(JSON.stringify(sent.sort()) === JSON.stringify(['Hooks and multiple instances of React', 'I had multiple instances of React by mistake.']),
    'GitHub sent more than its content: ' + JSON.stringify(sent));
  sent = await translate('github.com', '<h2>Build and ship software on a single platform</h2>');
  check(sent.includes('Build and ship software on a single platform'), 'A GitHub page without content was not translated');

  // Stack Overflow: posts and comments, which are spans; not tags.
  sent = await translate('stackoverflow.com', \`
    <div class="s-prose"><p>Use git reset to undo the commit.</p></div>
    <div class="post-taglist"><a class="post-tag">version-control</a></div>
    <div class="comment-body"><span class="comment-copy">See this guide for undoing commits.</span> – <a class="comment-user">Luzan Baral</a></div>
  \`);
  check(JSON.stringify(sent.sort()) === JSON.stringify(['See this guide for undoing commits.', 'Use git reset to undo the commit.']),
    'Stack Overflow sent more or less than its posts and comments: ' + JSON.stringify(sent));
}
run().then(() => { document.body.dataset.result = 'passed'; }, (error) => {
  document.body.dataset.result = 'failed';
  document.getElementById('result').textContent = error.stack;
});
`;

// Bundles a test script with the stubbed extension APIs and runs it on a page in headless Chrome.
async function runInChrome(script) {
  const directory = await mkdtemp(join(tmpdir(), 'shizue-page-translation-'));
  try {
    const result = await build({ stdin: { contents: script, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts' },
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
}

test('Page translation keeps code and formulas, shows the translation alone when asked, and sets its direction',
  { skip: !chrome && 'Chrome unavailable; set CHROME_BIN', timeout: 60000 }, () => runInChrome(browserTest));

test('Site rules leave out menus and dates, keep to the content, and translate a comment whole',
  { skip: !chrome && 'Chrome unavailable; set CHROME_BIN', timeout: 60000 }, () => runInChrome(rulesTest));
