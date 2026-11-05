import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const load = async (source) => {
  const outfile = fileURLToPath(new URL(`../.wxt/youtube-captions-${randomUUID()}.mjs`, import.meta.url));
  await build({
    entryPoints: [fileURLToPath(new URL(`../src/lib/${source}.ts`, import.meta.url))],
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
const { asrWords, groupAsrSentences } = await load('youtubeCaption/asrSentences');
const { toSrt, srtFileName } = await load('srt');
const fixture = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/youtube/${name}`, import.meta.url), 'utf8'));

// One event per line of words: [start ms, [[text, offset ms], ...]].
const events = (lines) => lines.map(([tStartMs, segs]) => ({
  tStartMs,
  dDurationMs: 5000,
  segs: segs.map(([utf8, tOffsetMs]) => ({ utf8, ...(tOffsetMs ? { tOffsetMs } : {}) })),
}));
const texts = (sentences) => sentences.map((sentence) => sentence.text);
const words = (text) => text.split(/\s+/).filter(Boolean);

test('Unpunctuated speech recognition is put back into sentences that fit on screen', async () => {
  const { events: track } = await fixture('asr-ted-unpunctuated.json');
  const sentences = groupAsrSentences(track);
  const said = asrWords(track).map((word) => word.text.trim());

  assert.deepEqual(sentences.flatMap((sentence) => words(sentence.text)), said, 'A word was lost or moved');
  // The recognizer's own lines hold 4 to 10 words; sentences hold more, and fewer of them.
  assert.ok(sentences.length < track.filter((event) => event.segs && !event.aAppend).length * 0.8);
  assert.equal(sentences[0].text, 'so in college I was a government major');
  assert.ok(texts(sentences).includes('which means I had to write a lot of papers'));
  assert.ok(texts(sentences).includes('they came and went and I I couldn\'t quite do stuff'));
  sentences.forEach((sentence, index) => {
    assert.ok(sentence.text.length <= 84, `Too wide: ${sentence.text}`);
    assert.ok(sentence.endTime > sentence.startTime, `Ends before it starts: ${sentence.text}`);
    assert.ok(sentence.endTime - sentence.startTime <= 10, `Too long: ${sentence.text}`);
    const next = sentences[index + 1];
    if (next) assert.ok(sentence.endTime <= next.startTime, `Overlaps the next: ${sentence.text}`);
  });
  assert.equal(sentences[0].startTime, 12.559);
});

test('Punctuated speech recognition keeps a sentence whole across the speaker\'s pauses', async () => {
  const { events: track } = await fixture('asr-minecraft-punctuated.json');
  const sentences = groupAsrSentences(track);
  assert.deepEqual(sentences.flatMap((sentence) => words(sentence.text)),
    asrWords(track).map((word) => word.text.trim()), 'A word was lost or moved');
  // The speaker stops for one to three seconds before the last words of these.
  for (const sentence of ['So, let\'s go ahead and make this wooden pick.', 'Let\'s grab some of this stuff.',
    'Then, let\'s make our stone pick.']) {
    assert.ok(texts(sentences).includes(sentence), `Split: ${sentence}`);
  }
  // Too long for the screen: cut at its comma, not after "the".
  assert.ok(texts(sentences).includes('Uh, I did not start with the chest, bonus chest,'));
  sentences.forEach((sentence) => {
    assert.ok(sentence.text.length <= 84, `Too wide: ${sentence.text}`);
    assert.ok(sentence.endTime - sentence.startTime <= 10, `Too long: ${sentence.text}`);
  });
});

test('Punctuated speech recognition ends sentences at their punctuation and changes of speaker', () => {
  const sentences = groupAsrSentences([
    { tStartMs: 0, dDurationMs: 900000 },
    ...events([
      [1000, [['>> Hello'], [' everyone.', 300], [' Today', 900], [' Mr.', 1200], [' Smith', 1400]]],
      [2800, [['will'], [' talk', 200], [' about', 400], [' rockets,', 600], [' and', 1100], [' why', 1300]]],
      [4500, [['they'], [' fly.', 200]]],
      [5200, [['>>'], [' Thanks', 100], [' for', 300], [' having', 450], [' me!', 650]]],
      [6600, [['[Music]']]],
      [9000, [['So'], [' that', 200], [' was', 350]]],
      // Over five seconds of silence.
      [15000, [['nice'], [' it', 200], [' was', 300], [' nice', 450]]],
    ]),
  ]);
  assert.deepEqual(texts(sentences), [
    'Hello everyone.',
    'Today Mr. Smith will talk about rockets, and why they fly.',
    'Thanks for having me!',
    '[Music]',
    'So that was',
    'nice it was nice',
  ]);
  assert.deepEqual(sentences.map((sentence) => sentence.startTime), [1, 1.9, 5.3, 6.6, 9, 15]);
  // A sentence lingers after its last word (two seconds at most, then one more to read), but not
  // into the next one.
  assert.equal(sentences[0].endTime, 1.9);
  assert.equal(sentences[4].endTime, 9.35 + 2 + 1);
  assert.equal(sentences[5].endTime, 15.45 + 2 + 1);
  assert.equal(sentences[3].endTime, 9);
});

test('A long run without pauses is cut where the speaker paused longest', () => {
  const line = (start, text, gap) => [start, text.split(' ').map((word, index) => [(index ? ' ' : '') + word, index * gap])];
  const sentences = groupAsrSentences(events([
    line(0, 'this one keeps going and going with no punctuation at all', 250),
    line(2750, 'until a short pause', 250),
    // 1.2 seconds after "pause" begins.
    line(4500, 'and then it keeps on going again for quite a while longer', 250),
  ]));
  assert.deepEqual(texts(sentences), [
    'this one keeps going and going with no punctuation at all until a short pause',
    'and then it keeps on going again for quite a while longer',
  ]);
});

test('Japanese speech recognition keeps its words together without spaces', () => {
  const sentences = groupAsrSentences(events([
    [0, [['今日は'], ['いい', 300], ['天気', 500], ['ですね。', 800]]],
    [1600, [['明日は'], ['雨', 400], ['らしい', 600], ['です', 900]]],
  ]));
  assert.deepEqual(texts(sentences), ['今日はいい天気ですね。', '明日は雨らしいです']);
});

test('Words starting a recognizer line get the space their language uses', () => {
  assert.deepEqual(
    asrWords(events([[0, [['so'], [' in', 200]]], [400, [['college'], [',', 300]]], [900, [['안녕'], [' 하세요', 300]]]]))
      .map((word) => word.text),
    ['so', ' in', ' college', ',', ' 안녕', ' 하세요']
  );
});

test('Captions save as a SubRip file', () => {
  assert.equal(
    toSrt([
      { startTime: 1.5, endTime: 3.25, text: 'Hello everyone.' },
      { startTime: 4, endTime: 4, text: '   ' },
      { startTime: 3723.0004, endTime: 3725.9999, text: 'Line one\n\n  line two ' },
    ]),
    '1\n00:00:01,500 --> 00:00:03,250\nHello everyone.\n\n2\n01:02:03,000 --> 01:02:06,000\nLine one\nline two\n'
  );
  assert.equal(srtFileName('What: a "video"?/part 1', 'English-Korean'), 'What a video part 1.English-Korean.srt');
  assert.equal(srtFileName('  ', 'Korean'), 'captions.Korean.srt');
});

test('Each sentence keeps where its words start and when they are said, for the word being spoken', () => {
  const [first, second] = groupAsrSentences([
    { tStartMs: 1000, dDurationMs: 3000, segs: [{ utf8: 'Hello' }, { utf8: ' world.', tOffsetMs: 500 }, { utf8: ' How', tOffsetMs: 1200 }, { utf8: ' are', tOffsetMs: 1500 }, { utf8: ' you?', tOffsetMs: 1800 }] },
    { tStartMs: 4000, aAppend: 1, segs: [{ utf8: '\n' }] },
  ]);
  assert.equal(first.text, 'Hello world.');
  assert.deepEqual(first.words, [{ offset: 0, time: 1 }, { offset: 6, time: 1.5 }]);
  assert.equal(second.text, 'How are you?');
  assert.deepEqual(second.words, [{ offset: 0, time: 2.2 }, { offset: 4, time: 2.5 }, { offset: 8, time: 2.8 }]);
  for (const sentence of [first, second]) {
    for (const word of sentence.words) assert.notEqual(sentence.text[word.offset], ' ');
  }
});

const { movedPosition, resizedRatio, isCaptionPosition, DEFAULT_CAPTION_POSITION } = await load('captionMove');

test('Captions dragged across the player stay inside it, and the corner handle scales them', () => {
  const box = { width: 200, height: 40 };
  const player = { width: 1000, height: 500 };
  // 100 px right and 50 px up from the bottom center.
  const moved = movedPosition(DEFAULT_CAPTION_POSITION, 100, -50, box, player);
  assert.deepEqual([moved.x, Math.round(moved.y * 1000) / 1000], [0.6, 0.12]);
  // Far past the bottom right corner: the box's edge stops at the player's.
  assert.deepEqual(movedPosition(DEFAULT_CAPTION_POSITION, 900, 900, box, player), { x: 0.9, y: 0 });
  assert.deepEqual(movedPosition(DEFAULT_CAPTION_POSITION, -900, -900, box, player), { x: 0.1, y: 0.92 });
  // The box is centered, so its right edge moving 50 px of its 100 px half makes it 1.5 times as large.
  assert.equal(resizedRatio(1, 50, 200), 1.5);
  assert.equal(resizedRatio(1, -500, 200), 0.3);
  assert.equal(resizedRatio(4, 500, 200), 5);
  assert.equal(isCaptionPosition({ x: 0.4, y: 0.1 }), true);
  for (const value of [null, { x: 1 }, { x: 1, y: Number.NaN }, { x: '0.5', y: 0 }]) assert.equal(isCaptionPosition(value), false);
});
