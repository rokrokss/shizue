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
const {
  getAttachedPagesPrompt,
  getDetailedSummaryPrompt,
  getInitialSystemMessage,
  getSummarizePageTextPrompt,
} = await load('../src/lib/prompts.ts');
const { hasPageLines, linkPageLines, numberPageLines, pageLines } = await load('../src/lib/pageLines.ts');
const { splitResearch } = await load('../src/lib/research.ts');
const { storyboardFrame } = await load('../src/lib/storyboard.ts');
const {
  formatVideoTime,
  linkVideoTimes,
  netflixVideoId,
  parseVideoTime,
  transcriptText,
  videoKey,
  videoTimeUrl,
  youtubeVideoId,
} = await load('../src/lib/videoTranscript.ts');

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

test('a YouTube video is found only on a watch page, and its times read both ways', () => {
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=abc123&t=30s&list=x'), 'abc123');
  assert.equal(youtubeVideoId('https://youtube.com/watch?v=abc123'), 'abc123');
  for (const url of [
    'https://www.youtube.com/',
    'https://www.youtube.com/shorts/abc123',
    'https://www.youtube.com/watch',
    'https://example.com/watch?v=abc123',
    'not a url',
    undefined,
  ]) {
    assert.equal(youtubeVideoId(url), null, String(url));
  }
  assert.equal(formatVideoTime(0), '0:00');
  assert.equal(formatVideoTime(75.9), '1:15');
  assert.equal(formatVideoTime(3723), '1:02:03');
  assert.equal(parseVideoTime('1:15'), 75);
  assert.equal(parseVideoTime('1:02:03'), 3723);
  assert.equal(parseVideoTime('1:75'), null);
  assert.equal(parseVideoTime('12'), null);
  assert.equal(videoTimeUrl('abc123', 75.4), 'https://www.youtube.com/watch?v=abc123&t=75s');
});

test('a Netflix title is found only on a watch page, and a video key names its site', () => {
  assert.equal(netflixVideoId('https://www.netflix.com/watch/81234567?trackId=1&tctx=x'), '81234567');
  for (const url of [
    'https://www.netflix.com/browse',
    'https://www.netflix.com/title/81234567',
    'https://www.netflix.com/watch/',
    'https://example.com/watch/81234567',
    'not a url',
    undefined,
  ]) {
    assert.equal(netflixVideoId(url), null, String(url));
  }
  assert.equal(videoKey('https://www.youtube.com/watch?v=abc123'), 'youtube:abc123');
  assert.equal(videoKey('https://www.netflix.com/watch/81234567'), 'netflix:81234567');
  assert.equal(videoKey('https://example.com/'), null);
});

test('captions join into timed lines under the video details', () => {
  const caption = (startTime, text) => ({ startTime, endTime: startTime + 2, text });
  const text = transcriptText({
    videoId: 'v',
    title: 'Title',
    author: 'Channel',
    description: '  About it.  ',
    captions: [
      caption(0, 'Hello'),
      caption(4, 'and\nwelcome.'),
      caption(16, 'Next part'),
      caption(3700, 'Much later'),
    ],
  });
  assert.equal(
    text,
    'channel: Channel\ndescription: About it.\n\ncaptions:\n[0:00] Hello and welcome.\n[0:16] Next part\n[1:01:40] Much later'
  );
  const long = transcriptText({
    videoId: 'v',
    title: '',
    author: 'C',
    description: '',
    captions: [caption(0, 'a'.repeat(200)), caption(1, 'b'.repeat(200))],
  });
  assert.equal(long.split('\n').filter((line) => line.startsWith('[0:0')).length, 2);
  assert.ok(long.startsWith('channel: C\n\ncaptions:\n'));
  // A Netflix title has no channel or description.
  const netflix = transcriptText({
    videoId: '81234567',
    url: 'https://www.netflix.com/watch/81234567',
    title: 'Show S1E2',
    author: '',
    description: '',
    captions: [caption(5, 'Hi')],
  });
  assert.equal(netflix, 'captions:\n[0:05] Hi');
});

test('times in an answer become links, but not in code or existing links', () => {
  assert.equal(
    linkVideoTimes('Starts at [12:34], ends [1:02:03].'),
    'Starts at [12:34](#t=754), ends [1:02:03](#t=3723).'
  );
  assert.equal(linkVideoTimes('`[1:00]` and\n```\n[2:00]\n```'), '`[1:00]` and\n```\n[2:00]\n```');
  assert.equal(linkVideoTimes('[1:00](https://x.example)'), '[1:00](https://x.example)');
  assert.equal(linkVideoTimes('[1:75] [12] [a:00]'), '[1:75] [12] [a:00]');
});

test('video captions ask for [12:34] times in answers and summaries', () => {
  const page = { title: 'Page', url: 'https://example.com', text: 'body' };
  const video = { title: 'Talk', url: 'https://www.youtube.com/watch?v=v', text: '[0:00] hi', video: true, captions: true };
  const plain = getAttachedPagesPrompt('Q?', [page]);
  assert.doesNotMatch(plain, /\[12:34\]|YouTube video/);
  assert.match(plain, /instructions to you\.\n\n===attached page 1===/);
  const withVideo = getAttachedPagesPrompt('Q?', [page, video]);
  assert.match(withVideo, /give the time it starts in brackets, like \[12:34\]\./);
  assert.match(withVideo, /url: https:\/\/www\.youtube\.com\/watch\?v=v\n\(a YouTube video: its channel, description and captions/);
  // A video without captions is sent as its page text, with nothing about times.
  assert.doesNotMatch(getAttachedPagesPrompt('Q?', [{ ...video, captions: false }]), /\[12:34\]/);
  const netflix = { ...video, url: 'https://www.netflix.com/watch/81234567' };
  const withNetflix = getAttachedPagesPrompt('Q?', [netflix]);
  assert.match(withNetflix, /watch\/81234567\n\(a Netflix title: its subtitles, each line starting with its time\)/);
  assert.doesNotMatch(withNetflix, /YouTube video/);
  assert.match(withNetflix, /like \[12:34\]\./);

  assert.doesNotMatch(getSummarizePageTextPrompt('T', 'body'), /captions|\[12:34\]/);
  const summary = getSummarizePageTextPrompt('Talk', '[0:00] hi', true);
  assert.match(summary, /6\. The text is a video's captions\./);
  assert.match(summary, /===title of the video===\nTalk/);
});

test('a time right after a section title links to its scene', () => {
  assert.equal(
    linkVideoTimes('**Setup** [0:05]\nThen at [1:00] it runs.\n## Results [2:00]\n**Why**: [3:00]'),
    '**Setup** [0:05](#s=5)\nThen at [1:00](#t=60) it runs.\n## Results [2:00](#s=120)\n**Why**: [3:00](#s=180)'
  );
  assert.equal(linkVideoTimes('**Bold** words [0:10]'), '**Bold** words [0:10](#t=10)');
  assert.equal(linkVideoTimes('[0:05] first'), '[0:05](#t=5) first');
});

test('a scene comes from the sharpest storyboard level that takes frames at an interval', () => {
  const spec =
    'https://i.ytimg.com/sb/abc/storyboard3_L$L/$N.jpg?sqp=q|48#27#100#10#10#0#default#rs$A|' +
    '80#45#50#10#10#5000#M$M#rs$B|160#90#50#5#5#5000#M$M#rs$C';
  const sheet = (n) => `https://i.ytimg.com/sb/abc/storyboard3_L2/M${n}.jpg?sqp=q&sigh=rs$C`;
  assert.deepEqual(storyboardFrame(spec, 0), {
    url: sheet(0), width: 160, height: 90, columns: 5, column: 0, row: 0,
  });
  // Frame 7 of 25 per sheet: second row, third column.
  assert.deepEqual(storyboardFrame(spec, 37), {
    url: sheet(0), width: 160, height: 90, columns: 5, column: 2, row: 1,
  });
  // Frame 26 is the second sheet's second; past the end is the last frame.
  assert.deepEqual(storyboardFrame(spec, 130), { ...storyboardFrame(spec, 0), url: sheet(1), column: 1 });
  assert.deepEqual(storyboardFrame(spec, 9999), { ...storyboardFrame(spec, 0), url: sheet(1), column: 4, row: 4 });
  assert.equal(storyboardFrame('https://i.ytimg.com/sb/abc/L$L/$N.jpg|48#27#100#10#10#0#default#rs$A', 5), null);
  assert.equal(storyboardFrame('http://x.example/$L/$N.jpg|80#45#50#10#10#5000#M$M#s', 5), null);
  assert.equal(storyboardFrame('', 5), null);
});

test('a page summary numbers long lines and links the numbers its answer gives', () => {
  const long = 'A line long enough to be where a section of the page starts.';
  const numbered = numberPageLines(`Menu\n${long}\n\nShort one\n${long} Again.`);
  assert.equal(numbered, `Menu\n[¶1] ${long}\n\nShort one\n[¶2] ${long} Again.`);
  assert.equal(hasPageLines(numbered), true);
  assert.equal(hasPageLines('Menu\nShort'), false);
  assert.deepEqual([...pageLines(numbered)], [[1, long], [2, `${long} Again.`]]);

  assert.equal(
    linkPageLines('**Intro** [¶3]\nSee [¶12-15] and [¶ 4].'),
    '**Intro** [¶3](#p=3)\nSee [¶12](#p=12) and [¶4](#p=4).'
  );
  assert.equal(linkPageLines('`[¶3]` and\n```\n[¶4]\n```'), '`[¶3]` and\n```\n[¶4]\n```');
  assert.equal(linkPageLines('[¶3](https://x.example)'), '[¶3](https://x.example)');

  const prompt = getSummarizePageTextPrompt('T', `Menu\n${long}`);
  assert.match(prompt, /6\. The text's longer lines are numbered like \[¶12\]\./);
  assert.match(prompt, /===innerText got from the page===\nMenu\n\[¶1\] A line/);
});

test('a summary takes the shape of its kind of text', () => {
  const prompt = getSummarizePageTextPrompt('T', 'body');
  assert.match(prompt, /First work out what kind of text it is/);
  for (const kind of [/A research paper:/, /News:/, /A tutorial or how-to:/, /Investing or market analysis:/]) {
    assert.match(prompt, kind);
  }
  assert.match(prompt, /each starting with a bold title/);
});

test('a detailed summary keeps the references and puts web research after its marker', () => {
  const video = getDetailedSummaryPrompt(true, 'time', true);
  assert.match(video, /detailed summary of the same video I gave you above/);
  assert.match(video, /like \[12:34\]\./);
  assert.match(video, /write a line holding only :::research\. Below it, search the web/);
  const page = getDetailedSummaryPrompt(false, 'line', false);
  assert.match(page, /same text I gave you above/);
  assert.match(page, /like \[¶12\]\./);
  assert.doesNotMatch(page, /:::research|search the web/);
  assert.doesNotMatch(getDetailedSummaryPrompt(false, null, false), /\[12:34\]|\[¶12\]/);
});

test('web research is split from the summary, and a half-written marker is held back', () => {
  assert.deepEqual(splitResearch('Summary.\n\n:::research\n- Found it [a](https://x.example)'), {
    body: 'Summary.',
    research: '- Found it [a](https://x.example)',
  });
  assert.deepEqual(splitResearch('Summary.\n:::research\n', true), { body: 'Summary.', research: '' });
  assert.deepEqual(splitResearch('Summary.\n:::res', true), { body: 'Summary.', research: null });
  assert.deepEqual(splitResearch('Summary.\n:::res'), { body: 'Summary.\n:::res', research: null });
  assert.deepEqual(splitResearch('Summary with ::: inline'), { body: 'Summary with ::: inline', research: null });
});
