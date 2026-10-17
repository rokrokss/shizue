import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const load = async (source) => {
  const outfile = fileURLToPath(new URL(`../.wxt/netflix-${randomUUID()}.mjs`, import.meta.url));
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
const { parseSubtitles, alignCues, findCueIndex } = await load('netflix/subtitles');

const round = (cues) => cues.map((c) => [Math.round(c.startTime * 1000) / 1000, Math.round(c.endTime * 1000) / 1000, c.text]);

test('DFXP in ticks: line breaks, styled spans, entities and shared time ranges', () => {
  const dfxp = `<?xml version="1.0" encoding="utf-8"?>
<tt xmlns:tt="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:tickRate="10000000" xml:lang="en">
<head><styling><style xml:id="style0" tts:fontStyle="normal"/></styling></head>
<body><div xml:space="preserve">
<p begin="51718333t" end="70737500t" region="region0" style="style0" xml:id="subtitle0">- Where are you going?<br/><span style="style1">- Home &amp; away.</span></p>
<p begin="93593333t" end="112612500t" region="region1" xml:id="subtitle1">[DOOR CREAKS]</p>
<p begin="93593333t" end="112612500t" region="region0" xml:id="subtitle2">Who&apos;s there?</p>
<p begin="112612500t" end="112612500t" xml:id="empty">zero length</p>
</div></body></tt>`;
  assert.deepEqual(round(parseSubtitles(dfxp)), [
    [5.172, 7.074, '- Where are you going?\n- Home & away.'],
    [9.359, 11.261, "[DOOR CREAKS]\nWho's there?"],
  ]);
});

test('TTML clock times, frames and Japanese ruby', () => {
  const imsc = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:frameRate="24" ttp:frameRateMultiplier="1000 1001">
<body><div>
<p begin="00:00:01.500" end="00:00:03.000"><span tts:ruby="container"><span tts:ruby="base">漢字</span><span tts:ruby="text">かんじ</span></span>です</p>
<p begin="00:00:04:12" dur="2s">二行目</p>
</div></body></tt>`;
  const cues = round(parseSubtitles(imsc));
  assert.deepEqual(cues[0], [1.5, 3, '漢字です']);
  assert.equal(cues[1][2], '二行目');
  assert.ok(Math.abs(cues[1][0] - (4 + 12 / (24000 / 1001))) < 0.001);
  assert.ok(Math.abs(cues[1][1] - cues[1][0] - 2) < 0.001);
});

test('WebVTT with Netflix cue settings, class tags and direction marks', () => {
  const vtt = `WEBVTT

1
00:00:05.172 --> 00:00:07.074 position:50.00%,middle align:middle size:80.00% line:79.33%
<c.bg_transparent>&lrm;- Where are you going?</c.bg_transparent>
<c.bg_transparent>&lrm;- <i>Home</i>.</c.bg_transparent>

2
01:00:09.359 --> 01:00:11.261 position:50.00%,middle align:middle size:80.00% line:84.67%
<c.korean>어디 가?</c.korean>
`;
  assert.deepEqual(round(parseSubtitles(vtt)), [
    [5.172, 7.074, '- Where are you going?\n- Home.'],
    [3609.359, 3611.261, '어디 가?'],
  ]);
});

test('cues end when the next one starts and are found by time', () => {
  const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
one

00:00:03.000 --> 00:00:05.000
two
`;
  const cues = parseSubtitles(vtt);
  assert.deepEqual(round(cues), [
    [1, 3, 'one'],
    [3, 5, 'two'],
  ]);
  assert.equal(findCueIndex(cues, 0.5), -1);
  assert.equal(findCueIndex(cues, 1), 0);
  assert.equal(findCueIndex(cues, 3), 1);
  assert.equal(findCueIndex(cues, 5), -1);
});

test('official target cues pair with the original cues they overlap', () => {
  const originals = [
    { startTime: 1, endTime: 3, text: 'Hello.' },
    { startTime: 3, endTime: 6, text: 'How are you? Fine.' },
    { startTime: 8, endTime: 9, text: 'Bye.' },
    { startTime: 10, endTime: 11, text: 'Wait,' },
    { startTime: 11, endTime: 12, text: 'come back.' },
    { startTime: 14, endTime: 15, text: '[MUSIC]' },
  ];
  const targets = [
    // Shifted a little: belongs to the first line only.
    { startTime: 1.1, endTime: 3.2, text: '안녕.' },
    // The second line split in two.
    { startTime: 3.2, endTime: 4.5, text: '잘 지내?' },
    { startTime: 4.5, endTime: 6, text: '응.' },
    // A sign shown only in the target track.
    { startTime: 6.5, endTime: 7, text: '(표지판)' },
    { startTime: 8.2, endTime: 9, text: '잘 가.' },
    // One line for two original lines.
    { startTime: 10, endTime: 12, text: '기다려, 돌아와.' },
  ];
  const { cues, translations } = alignCues(originals, targets);
  assert.deepEqual(
    cues.map((cue, i) => [cue.startTime, cue.text, translations[i]]),
    [
      [1, 'Hello.', '안녕.'],
      [3, 'How are you? Fine.', '잘 지내?\n응.'],
      [6.5, '', '(표지판)'],
      [8, 'Bye.', '잘 가.'],
      [10, 'Wait,', '기다려, 돌아와.'],
      [11, 'come back.', '기다려, 돌아와.'],
      [14, '[MUSIC]', ''],
    ]
  );
});

const { createCueTranslator } = await load('netflix/cueTranslator');
const cuesEvery = (count, seconds) =>
  Array.from({ length: count }, (_, i) => ({ startTime: i * seconds, endTime: (i + 1) * seconds, text: `line ${i}` }));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('cue translator starts at the playback position, follows seeks and stays within the lookahead', async () => {
  const requested = [];
  const translator = createCueTranslator({
    cues: cuesEvery(100, 10),
    chunkSize: 10,
    lookaheadSeconds: 150,
    onUpdate: () => {},
    translate: async (part, start) => {
      assert.equal(part[0].text, `line ${start}`);
      requested.push(part[0].text);
      return part.map((cue) => `T ${cue.text}`);
    },
  });
  translator.setPosition(305);
  for (let i = 0; i < 10; i++) await settle();
  // Chunks 3 and 4 start within 150 s of 305 s; chunk 5 starts at 500 s.
  assert.deepEqual(requested, ['line 30', 'line 40']);
  assert.equal(translator.translation(30), 'T line 30');
  assert.equal(translator.translation(29), undefined);
  translator.setPosition(5);
  for (let i = 0; i < 10; i++) await settle();
  assert.deepEqual(requested, ['line 30', 'line 40', 'line 0', 'line 10']);
  translator.stop();
  translator.setPosition(600);
  for (let i = 0; i < 10; i++) await settle();
  assert.equal(requested.length, 4);
});

test('cue translator retries a failed chunk once, then leaves its originals', async () => {
  let calls = 0;
  const translator = createCueTranslator({
    cues: cuesEvery(5, 1),
    onUpdate: () => {},
    translate: async () => {
      calls++;
      return null;
    },
  });
  translator.setPosition(0);
  for (let i = 0; i < 10; i++) await settle();
  assert.equal(calls, 2);
  assert.equal(translator.translation(0), '');
});

const { pickOriginalTrack, pickTargetTrack } = await load('netflix/tracks');
const track = (trackId, language, closedCaptions = false) => ({ trackId, language, label: language, closedCaptions });

test('the original track follows the audio language and prefers CC over subtitles', () => {
  const tracks = [track('c', 'en'), track('a', 'en', true), track('b', 'ko'), track('k', 'ko', true), track('d', 'es-ES'), track('e', 'es')];
  assert.equal(pickOriginalTrack(tracks, 'en').trackId, 'a');
  // A Korean dub: its CC is what is said, the plain Korean subtitles translate the original.
  assert.equal(pickOriginalTrack(tracks, 'ko').trackId, 'k');
  assert.equal(pickOriginalTrack(tracks, 'es').trackId, 'e');
  assert.equal(pickOriginalTrack(tracks, 'es-ES').trackId, 'd');
  assert.equal(pickOriginalTrack([track('j', 'ja')], 'ja-JP').trackId, 'j');
  // No subtitles in the spoken language: English, else the first track.
  assert.equal(pickOriginalTrack(tracks, 'th').trackId, 'a');
  assert.equal(pickOriginalTrack([track('x', 'ko')], null).trackId, 'x');
  assert.equal(pickOriginalTrack([], 'en'), null);
});

test('the target track maps Netflix tags to the app languages', () => {
  const tracks = [track('s', 'zh-Hans'), track('t', 'zh-Hant'), track('k', 'ko', true), track('k2', 'ko'), track('p', 'pt-BR')];
  assert.equal(pickTargetTrack(tracks, 'ChineseSimplified_简体中文').trackId, 's');
  assert.equal(pickTargetTrack(tracks, 'ChineseTraditional_繁體中文').trackId, 't');
  assert.equal(pickTargetTrack(tracks, 'Korean_한국어').trackId, 'k2');
  assert.equal(pickTargetTrack(tracks, 'PortugueseBR_Português').trackId, 'p');
  assert.equal(pickTargetTrack(tracks, 'Japanese_日本語'), null);
});
