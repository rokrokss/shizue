import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const temporaries = [];
after(() => Promise.all(temporaries.map((file) => rm(file, { force: true }))));
const load = async (source) => {
  const temporary = fileURLToPath(new URL(`../.wxt/chat-features-${randomUUID()}.mjs`, import.meta.url));
  temporaries.push(temporary);
  await build({
    entryPoints: [fileURLToPath(new URL(source, import.meta.url))],
    outfile: temporary,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
  });
  return import(pathToFileURL(temporary).href);
};
const { hasMath, prepareMath } = await load('../src/lib/mathText.ts');
const { parseChartSpec } = await load('../src/lib/chartSpec.ts');
const { collectWebSources, orderedWebSources } = await load('../src/lib/webSources.ts');
const { isPdfFile, isTextFile, readTextFile } = await load('../src/lib/tabText.ts');
const { mergeMemoryFacts, parseMemoryFacts, questionsToRemember, AUTO_MEMORY_MAX_FACTS } = await load(
  '../src/lib/autoMemory.ts'
);
const { getInitialSystemMessage } = await load('../src/lib/prompts.ts');

test('math is found only in TeX delimiters outside code, and prices stay text', () => {
  assert.equal(hasMath('It costs $5 and $10.'), false);
  assert.equal(hasMath('Use `$x$` in code'), false);
  assert.equal(hasMath('```\n$$a$$\n```'), false);
  for (const text of ['$x^2$ grows', '$$\\frac{a}{b}$$', '\\(a+b\\)', '\\[a+b\\]']) {
    assert.equal(hasMath(text), true, text);
  }
  assert.equal(prepareMath('From $5 to $x$'), 'From \\$5 to $x$');
  assert.equal(prepareMath('Inline \\(a+b\\) here'), 'Inline $a+b$ here');
  assert.equal(prepareMath('\\[a+b\\]'), '\n$$\na+b\n$$\n');
  assert.equal(prepareMath('$$a+b$$'), '$$\na+b\n$$');
  assert.equal(prepareMath('`$5` and ```\n\\(x\\)\n```'), '`$5` and ```\n\\(x\\)\n```');
});

test('a chart block is drawn only when its JSON fits the chart shape', () => {
  const spec = parseChartSpec(
    JSON.stringify({
      type: 'bar',
      title: 'Sales',
      x: 'month',
      series: [{ key: 'sales', name: 'Sales' }, { key: 'cost' }],
      data: [
        { month: 'Jan', sales: '1,200', cost: 3 },
        { month: 'Feb', sales: 1500, cost: '35%', extra: 'dropped' },
      ],
    })
  );
  assert.deepEqual(spec, {
    type: 'bar',
    title: 'Sales',
    x: 'month',
    series: [
      { key: 'sales', name: 'Sales' },
      { key: 'cost', name: 'cost' },
    ],
    data: [
      { month: 'Jan', sales: 1200, cost: 3 },
      { month: 'Feb', sales: 1500, cost: 35 },
    ],
  });
  const valid = { type: 'line', x: 'm', series: [{ key: 'v' }], data: [{ m: 'a', v: 1 }] };
  assert.ok(parseChartSpec(JSON.stringify(valid)));
  for (const broken of [
    '{"type": "line", ',
    JSON.stringify({ ...valid, type: 'pie' }),
    JSON.stringify({ ...valid, series: [] }),
    JSON.stringify({ ...valid, series: Array.from({ length: 7 }, (_, i) => ({ key: `s${i}` })) }),
    JSON.stringify({ ...valid, series: [{ key: 'm' }] }),
    JSON.stringify({ ...valid, data: [{ m: 'a', v: 'many' }] }),
    JSON.stringify({ ...valid, data: [{ v: 1 }] }),
    JSON.stringify({ ...valid, data: [] }),
  ]) {
    assert.equal(parseChartSpec(broken), null, broken);
  }
});

test('web sources come from every provider shape, cited first and at most 8', () => {
  const found = new Map();
  // Anthropic search results, then a text citation pointing at the second one.
  collectWebSources(
    [
      {
        type: 'web_search_tool_result',
        content: [
          { type: 'web_search_result', url: 'https://a.example/1', title: 'A' },
          { type: 'web_search_result', url: 'https://b.example/2', title: 'B' },
        ],
      },
      { type: 'text', text: 'x', citations: [{ type: 'web_search_result_location', url: 'https://b.example/2', title: 'B' }] },
    ],
    found
  );
  // OpenAI annotations and Gemini grounding chunks.
  collectWebSources({ annotations: [{ type: 'url_citation', url: 'https://c.example/', title: '' }] }, found);
  collectWebSources({ groundingMetadata: { groundingChunks: [{ web: { uri: 'https://d.example/x', title: 'd.example' } }] } }, found);
  // Not web addresses, and a broken one, are skipped without throwing.
  collectWebSources({ url: 'https://', uri: 'mailto:x@example.com', image: { url: 'data:image/png;base64,AA' } }, found);

  assert.deepEqual(orderedWebSources(found), [
    { url: 'https://b.example/2', title: 'B' },
    { url: 'https://c.example/', title: 'c.example' },
    { url: 'https://a.example/1', title: 'A' },
    { url: 'https://d.example/x', title: 'd.example' },
  ]);

  const many = new Map();
  collectWebSources(Array.from({ length: 12 }, (_, i) => ({ url: `https://e.example/${i}` })), many);
  assert.equal(orderedWebSources(many).length, 8);
});

test('text and code files are read as attachments; binary and blank ones are not', async () => {
  assert.equal(isPdfFile(new File(['%PDF'], 'paper.PDF')), true);
  assert.equal(isTextFile(new File(['x'], 'notes.md')), true);
  assert.equal(isTextFile(new File(['x'], 'main.rs')), true);
  assert.equal(isTextFile(new File(['x'], 'data', { type: 'application/json' })), true);
  assert.equal(isTextFile(new File(['x'], 'photo.png', { type: 'image/png' })), false);

  assert.deepEqual(await readTextFile(new File(['const a = 1;\n'], 'a.ts')), {
    page: { title: 'a.ts', url: '', text: 'const a = 1;\n', file: true },
  });
  assert.deepEqual(await readTextFile(new File(['  \n'], 'blank.txt')), { error: 'empty' });
  assert.deepEqual(await readTextFile(new File(['ab\u0000cd'], 'fake.txt')), { error: 'unreadable' });
});

test('auto memory reads only new chat questions and keeps distinct, recent facts', () => {
  const message = (createdAt, extra) => ({
    id: String(createdAt),
    threadId: 't',
    role: 'human',
    actionType: 'chat',
    content: `question ${createdAt}`,
    createdAt,
    done: true,
    onInterrupt: false,
    stopped: false,
    ...extra,
  });
  const messages = [
    message(1),
    message(2, { role: 'ai' }),
    message(3, { translateMode: true }),
    message(4, { actionType: 'askForSummary' }),
    message(5, { content: '  ' }),
    message(6),
  ];
  assert.deepEqual(questionsToRemember(messages).map((m) => m.createdAt), [1, 6]);
  assert.deepEqual(questionsToRemember(messages, 1).map((m) => m.createdAt), [6]);
  assert.deepEqual(questionsToRemember(messages, 6), []);

  assert.deepEqual(parseMemoryFacts('```json\n{"facts": [" Uses Rust. ", "", 3]}\n```'), ['Uses Rust.']);
  assert.deepEqual(parseMemoryFacts('{"facts": []}'), []);
  assert.equal(parseMemoryFacts('No facts.'), null);
  assert.equal(parseMemoryFacts('{"items": []}'), null);
  assert.equal(parseMemoryFacts(JSON.stringify({ facts: Array(9).fill('a') })).length, 5);

  const known = [{ id: '1', text: 'The user writes Rust.', createdAt: 1 }];
  const merged = mergeMemoryFacts(known, ['the user writes rust', 'Likes short answers', 'Likes short answers.'], 2);
  assert.deepEqual(merged.map((fact) => fact.text), ['The user writes Rust.', 'Likes short answers']);
  const full = Array.from({ length: AUTO_MEMORY_MAX_FACTS }, (_, i) => ({ id: String(i), text: `fact ${i}`, createdAt: i }));
  const kept = mergeMemoryFacts(full, ['newest'], 99);
  assert.equal(kept.length, AUTO_MEMORY_MAX_FACTS);
  assert.equal(kept[0].text, 'fact 1');
  assert.equal(kept.at(-1).text, 'newest');
});

test('remembered facts follow the custom instructions in the system message', () => {
  const lang = 'Korean_한국어';
  const base = getInitialSystemMessage(lang);
  assert.equal(getInitialSystemMessage(lang, undefined, []), base);

  const onlyFacts = getInitialSystemMessage(lang, '', ['Uses Rust.']);
  assert.ok(onlyFacts.startsWith(`${base}\n6) You remember the facts below`));
  assert.match(onlyFacts, /The user's messages in this chat win over them\./);
  assert.match(onlyFacts, /===remembered facts===\n- Uses Rust\.\n===end of remembered facts===$/);

  const both = getInitialSystemMessage(lang, 'Answer briefly.', ['Uses Rust.', 'Lives in Seoul.']);
  assert.ok(both.startsWith(getInitialSystemMessage(lang, 'Answer briefly.')));
  assert.match(both, /\n7\) You remember the facts below/);
  assert.match(both, /custom instructions and messages in this chat win over them/);
  assert.match(both, /- Uses Rust\.\n- Lives in Seoul\./);
});
