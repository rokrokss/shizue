import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const load = async (source) => {
  const outfile = fileURLToPath(new URL(`../.wxt/live-caption-${randomUUID()}.mjs`, import.meta.url));
  await build({
    entryPoints: [fileURLToPath(new URL(`../src/lib/liveCaption/${source}.ts`, import.meta.url))],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
  });
  after(() => rm(outfile, { force: true }));
  return import(pathToFileURL(outfile).href);
};
const { createSegmenter, tokenize, joinTokens, textWidth } = await load('segmenter');
const { createTranslationQueue } = await load('translationQueue');
const fixture = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/twitch/${name}`, import.meta.url), 'utf8'));

// Replays [time ms, text] snapshots with a 100 ms timer, as the content script does.
const replay = (updates, options = {}) => {
  const sentences = [];
  let interim = '';
  const segmenter = createSegmenter({
    ...options,
    onSentence: (sentence) => sentences.push(sentence.text),
    onInterim: (text) => (interim = text),
  });
  let now = updates[0]?.[0] ?? 0;
  for (const [at, text] of updates) {
    for (; now < at; now += 100) segmenter.tick(now);
    if (text === null) segmenter.push({ kind: 'break', at });
    else segmenter.push({ kind: 'snapshot', text, at });
  }
  return { sentences, interim, segmenter, now };
};

const words = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, ' ').split(/\s+/).filter(Boolean);

test('tokenize splits Japanese and Chinese per character and keeps spaced languages whole', () => {
  assert.deepEqual(tokenize('Hello, world.').map((t) => t.key), ['hello', 'world']);
  assert.deepEqual(tokenize('今日は晴れ。OK').map((t) => t.text), ['今', '日', 'は', '晴', 'れ', '。', 'OK']);
  assert.deepEqual(tokenize('안녕하세요 여러분').map((t) => t.text), ['안녕하세요', '여러분']);
  assert.equal(joinTokens(tokenize('今日は OK です')), '今日は OK です');
});

test('roll-up DOM captions keep words that scroll off before their sentence ends', async () => {
  const { domRollup_annemunition: dom } = await fixture('recorded-sequences.json');
  const { sentences, segmenter, now } = replay(dom.updates.map(([at, lines]) => [at, lines.join(' ')]));
  segmenter.tick(now + 2000);
  assert.deepEqual(sentences, [
    'Potential to dominate and fights.',
    'Okay. So we have one of each',
    "Of the aardvarks so that's Max cuz they don't want more than that",
    'And then',
  ]);
});

test('PlayerTextCue windows on a live stream become caption-line chunks without repeats', async () => {
  const { playerTextCue_8bitdee: cues } = await fixture('recorded-sequences.json');
  const { sentences, segmenter, now } = replay(
    cues.events.map((event) => [event.startTime * 1000, event.text.replace(/\r\n/g, ' ')])
  );
  segmenter.tick(now + 2000);
  assert.deepEqual(sentences, [
    'Are great for me because they make cool warm and then an in-between neutral or',
    'Peach I usually have to buy neutral or Peach I actually have Peach undertones',
  ]);
});

test('VOD PlayerTextCue erasures and re-drawn words are not duplicated or lost', async () => {
  const { events } = await fixture('vod-player-text-cues.json');
  const { sentences, segmenter, now } = replay(
    events.map((event) => [event.position * 1000, event.text.replace(/\r\n/g, ' ')])
  );
  segmenter.tick(now + 2000);
  assert.deepEqual(sentences, [
    '16 damage',
    "He gets more damage the more stubby it's right",
    'Ratio destroyed',
    'Great',
    'Can I see him.',
    "I'm here oh yeah we can.",
    'Cause an enemy reaction what enemy reaction',
    'But I thought it have a good day',
    'Okay',
    'Oh no',
  ]);
});

test('Stream Closed Captioner paragraph text is split at pauses', async () => {
  const { scc_scaryume_paragraphLayout: scc } = await fixture('recorded-sequences.json');
  const { sentences, segmenter, now } = replay(scc.updates.map(([at, text]) => [at, text.replace(/¦/g, ' ')]));
  segmenter.tick(now + 2000);
  assert.deepEqual(sentences, [
    'safados divisão de Infantaria ir aos mortos do batalhão perdido ele guarda o',
    'trauma dele no bolso então',
    'né uma lembrança conhecimentos',
  ]);
});

test('a long growing paragraph (Stream Closed Captioner) is committed once, not over and over', () => {
  // SCC's paragraph layout shows up to 30 finished segments as one growing text, far longer than
  // the committed text the segmenter keeps for alignment.
  const all = Array.from({ length: 400 }, (_, index) => `w${index}`);
  const updates = [];
  for (let end = 3, at = 0; end <= all.length; end += 3, at += 400) {
    updates.push([at, all.slice(0, end).join(' ')]);
  }
  const { sentences, segmenter, now } = replay(updates);
  segmenter.tick(now + 5000);
  const committed = sentences.flatMap((sentence) => sentence.split(' '));
  assert.equal(new Set(committed).size, committed.length, 'a word was committed twice');
  assert.deepEqual(committed, all.slice(0, committed.length));
  assert.ok(committed.length >= 390, `only ${committed.length} of 400 words committed`);
});

test('a source that rewrites already committed words does not make them repeat', () => {
  // Stream Closed Captioner and speech recognition show interim words, then replace them with the
  // final wording after we may have committed the interim version.
  const updates = [
    [0, 'we were looking at the house and if I love this set of that'],
    [2000, 'we were looking at the house and maybe that setting is nice for the bedroom'],
    [2400, 'we were looking at the house and maybe that setting is nice for the bedroom it needs a garden'],
  ];
  const { sentences, segmenter, now } = replay(updates);
  segmenter.tick(now + 5000);
  const committed = sentences.join(' ').split(' ');
  assert.equal(committed.filter((word) => word === 'house').length, 1, sentences.join(' / '));
  assert.ok(sentences.join(' ').endsWith('it needs a garden'), sentences.join(' / '));
});

test('recorded Stream Closed Captioner snapshots become sentences without repeats', async () => {
  const { updates } = await fixture('scc-shadely-snapshots.json');
  const { sentences, segmenter, now } = replay(updates, { pauseMs: 3000 });
  segmenter.tick(now + 5000);
  const committed = sentences.join(' ').split(/\s+/);
  const seen = new Map();
  for (let i = 0; i + 8 <= committed.length; i++) {
    const gram = committed.slice(i, i + 8).join(' ').toLowerCase();
    assert.ok(!seen.has(gram) || i - seen.get(gram) <= 8, `repeated: "${gram}"`);
    seen.set(gram, i);
  }
  const last = updates[updates.length - 1][1].trim().split(/\s+/).slice(-8).join(' ');
  assert.ok(sentences.join(' ').endsWith(last), `missing the end: ${last}`);
  assert.ok(sentences.length >= 4 && sentences.length <= 12, `${sentences.length} sentences`);
  for (const sentence of sentences) assert.ok(sentence.length <= 80, `too long: ${sentence}`);
});

test('a rewritten speech hypothesis replaces the uncommitted tail', () => {
  const { sentences, segmenter, interim } = replay([
    [0, 'and that horrible'],
    [300, 'and that horious xdx'],
    [600, 'and that horious xdx with the special'],
    [900, 'and that is how it works with the special sign'],
  ]);
  assert.equal(interim, 'and that is how it works with the special sign');
  segmenter.tick(3000);
  assert.deepEqual(sentences, ['and that is how it works with the special sign']);
});

test('a sentence is committed once the speaker moves past its final punctuation', () => {
  const { sentences, interim } = replay([
    [0, 'This is the first sentence.'],
    [200, 'This is the first sentence. And'],
    [400, 'This is the first sentence. And then a second'],
  ]);
  assert.deepEqual(sentences, ['This is the first sentence.']);
  assert.equal(interim, 'And then a second');
});

test('short sentences join the next one instead of becoming their own line', () => {
  const { sentences } = replay([
    [0, 'Okay. Yes. So here we go now.'],
    [200, 'Okay. Yes. So here we go now. Next'],
  ]);
  assert.deepEqual(sentences, ['Okay. Yes. So here we go now.']);
});

test('a speaker who never pauses is cut at the length limit', () => {
  const text = Array.from({ length: 50 }, (_, index) => `w${index}`).join(' ');
  const { sentences, interim } = replay([[0, text]], { maxTokens: 20 });
  assert.equal(sentences.length, 2);
  assert.equal(words(sentences[0]).length, 20);
  assert.equal(words(interim).length, 10);
});

test('unpunctuated speech is cut at about a caption line, at a comma when one is in reach', () => {
  const { sentences, interim } = replay([[0, 'aaa bbb ccc ddd, eee fff ggg hhh iii jjj']], { maxWidth: 30 });
  assert.deepEqual(sentences, ['aaa bbb ccc ddd,']);
  assert.equal(interim, 'eee fff ggg hhh iii jjj');
});

test('Japanese, Chinese and Korean characters count as two columns', () => {
  assert.equal(textWidth(tokenize('hello world')), 11);
  assert.equal(textWidth(tokenize('日本語')), 6);
  assert.equal(textWidth(tokenize('가나 다')), 7);
  const { sentences, interim } = replay([[0, 'あ'.repeat(40)]], { maxWidth: 30 });
  assert.deepEqual(sentences, ['あ'.repeat(15), 'あ'.repeat(15)]);
  assert.equal(interim, 'あ'.repeat(10));
});

test('a break commits pending text and the next snapshot starts fresh', () => {
  const { sentences, interim } = replay([
    [0, 'we were talking about this'],
    [100, null],
    [200, 'we were talking about that'],
  ]);
  assert.deepEqual(sentences, ['we were talking about this']);
  assert.equal(interim, 'we were talking about that');
});

test('Japanese text without spaces is segmented and joined without spaces', () => {
  const { sentences, interim } = replay([
    [0, '今日はいい天気ですね。'],
    [200, '今日はいい天気ですね。明日は'],
  ]);
  assert.deepEqual(sentences, ['今日はいい天気ですね。']);
  assert.equal(interim, '明日は');
});

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

test('the queue batches waiting sentences and sends earlier translations as context', async () => {
  const calls = [];
  const results = [];
  const first = deferred();
  const queue = createTranslationQueue({
    now: () => 0,
    concurrency: 1,
    translate: (texts, context) => {
      calls.push({ texts, context });
      return calls.length === 1 ? first.promise : Promise.resolve(texts.map((t) => `T(${t})`));
    },
    onResult: (id, translation) => results.push([id, translation]),
  });
  const sentence = (id) => ({ id, text: id, startedAt: 0, committedAt: 0 });
  queue.enqueue(sentence('a'));
  queue.enqueue(sentence('b'));
  queue.enqueue(sentence('c'));
  queue.enqueue(sentence('d'));
  first.resolve(['T(a)']);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls[0], { texts: ['a'], context: [] });
  assert.deepEqual(calls[1], { texts: ['b', 'c', 'd'], context: [{ source: 'a', translation: 'T(a)' }] });
  assert.deepEqual(results, [['a', 'T(a)'], ['b', 'T(b)'], ['c', 'T(c)'], ['d', 'T(d)']]);
});

test('the queue drops stale sentences and reports failures as null', async () => {
  const results = [];
  let now = 0;
  const queue = createTranslationQueue({
    now: () => now,
    concurrency: 1,
    staleMs: 1000,
    translate: async (texts) => (texts[0] === 'fail' ? null : texts),
    onResult: (id, translation) => results.push([id, translation]),
  });
  queue.enqueue({ id: 'fail', text: 'fail', startedAt: 0, committedAt: 0 });
  queue.enqueue({ id: 'old', text: 'old', startedAt: 0, committedAt: 0 });
  now = 5000;
  queue.enqueue({ id: 'new', text: 'new', startedAt: 5000, committedAt: 5000 });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(results, [['fail', null], ['old', null], ['new', 'new']]);
});

test('clearing the queue ignores answers that arrive afterwards', async () => {
  const results = [];
  const pending = deferred();
  const queue = createTranslationQueue({
    now: () => 0,
    translate: () => pending.promise,
    onResult: (id, translation) => results.push([id, translation]),
  });
  queue.enqueue({ id: 'a', text: 'a', startedAt: 0, committedAt: 0 });
  queue.clear();
  pending.resolve(['late']);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(results, []);
});
