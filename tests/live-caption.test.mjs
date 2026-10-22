import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const load = async (source) => {
  const outfile = fileURLToPath(new URL(`../.wxt/live-caption-${randomUUID()}.mjs`, import.meta.url));
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
const { createSegmenter, tokenize, joinTokens, textWidth } = await load('liveCaption/segmenter');
const { createTranslationQueue } = await load('liveCaption/translationQueue');
const { createCea608Decoder } = await load('twitch/cea608');
const { createCaptionExtractor } = await load('twitch/captionExtractor');
const { createCaptionPrefetch, chunkKey } = await load('twitch/captionPrefetch');
const { joinCaptionLines } = await load('youtubeCaption/domCaptionSource');
const { cuesFromSegment, createUmpCaptionReader } = await load('youtubeCaption/sabr');
const { createLiveCaptionReadAhead } = await load('youtubeCaption/captionReadAhead');
const fixture = async (name, site = 'twitch') =>
  JSON.parse(await readFile(new URL(`./fixtures/${site}/${name}`, import.meta.url), 'utf8'));

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

test('commitPending commits what is pending but keeps it for aligning the window', () => {
  const sentences = [];
  let interim = '';
  const segmenter = createSegmenter({
    onSentence: (sentence) => sentences.push(sentence.text),
    onInterim: (text) => (interim = text),
  });
  segmenter.push({ kind: 'snapshot', text: 'we were talking about this', at: 0 });
  segmenter.commitPending(100);
  assert.deepEqual(sentences, ['we were talking about this']);
  assert.equal(interim, '');
  // The roll-up window still shows those words: only the new ones are pending.
  segmenter.push({ kind: 'snapshot', text: 'we were talking about this and that', at: 200 });
  assert.equal(interim, 'and that');
  segmenter.tick(5000);
  assert.deepEqual(sentences, ['we were talking about this', 'and that']);
});

test("CEA-608 from the player's buffered video decodes to the same windows as PlayerTextCue", async () => {
  const { pairs, cues } = await fixture('vod-cea608-pairs.json');
  const windows = [];
  const decoder = createCea608Decoder((pts, text) => windows.push([pts, text]));
  for (const [pts, b1, b2] of pairs) decoder.push(pts, b1, b2);
  decoder.flush();
  const last = cues[cues.length - 1][0];
  const collapse = (list) => list.filter((item, i) => i === 0 || item[1] !== list[i - 1][1]);
  const decoded = collapse(windows.filter(([pts]) => pts <= last + 0.5));
  const shown = collapse(cues);
  assert.deepEqual(
    decoded.map(([, text]) => text),
    shown.map(([, text]) => text)
  );
  // The player reports cues about every 0.26 s; decoded times are frame times.
  decoded.forEach(([pts], i) => assert.ok(Math.abs(pts - shown[i][0]) < 0.35, `${pts} vs ${shown[i][0]}`));
});

test('the caption extractor reads CEA-608 out of a recorded fMP4 fragment, also as a string', async () => {
  const { init, fragment, offset, pairs } = await fixture('vod-fmp4-fragment.json');
  const bytes = (base64) => new Uint8Array(Buffer.from(base64, 'base64'));
  // Twitch's worker gets the function's source, so it must not depend on anything around it.
  const standalone = new Function(`return (${createCaptionExtractor.toString()})`)();
  for (const create of [createCaptionExtractor, standalone]) {
    const extractor = create();
    assert.deepEqual(extractor.extract(bytes(init), 0), []);
    assert.deepEqual(extractor.extract(bytes(fragment), offset), pairs);
  }
});

test('captions read ahead translate each on-screen chunk early and end it without the pause', async () => {
  const { pairs, cues } = await fixture('vod-cea608-pairs.json');
  // Plays the recorded cues through an on-screen segmenter like the controller's, with or without
  // the read-ahead captions (fed all at once, as a VOD buffers them well ahead).
  const play = async (withPrefetch) => {
    const lines = [];
    let pending = '';
    let segmenter;
    const prefetch = createCaptionPrefetch({
      translate: async (texts) => texts.map((text) => `[KO] ${text}`),
      onTranslation: () => {},
      onChunk: () => {
        if (pending && prefetch.isComplete(pending)) segmenter.commitPending(now);
      },
      position: () => now / 1000,
    });
    let now = cues[0][0] * 1000;
    segmenter = createSegmenter({
      onInterim: (text) => {
        pending = text;
        if (withPrefetch && prefetch.isComplete(text)) segmenter.commitPending(now);
      },
      onSentence: (sentence) => lines.push({ text: sentence.text, at: now / 1000, chunk: prefetch.chunk(sentence.text) }),
    });
    if (withPrefetch) {
      prefetch.add(pairs, cues[0][0]);
      prefetch.advance(pairs[pairs.length - 1][0] + 5);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    for (const [position, text] of cues) {
      for (; now < position * 1000; now += 100) segmenter.tick(now);
      segmenter.push({ kind: 'snapshot', text: text.replace(/\r\n/g, ' '), at: now });
    }
    for (const end = now + 3000; now < end; now += 100) segmenter.tick(now);
    return lines;
  };
  const before = await play(false);
  const after = await play(true);
  // Ending a chunk early can leave off punctuation that arrives with the next words.
  assert.deepEqual(
    after.map((line) => chunkKey(line.text)),
    before.map((line) => chunkKey(line.text)),
    'the chunks on screen stay the same'
  );
  // The first chunk read starts mid-window and is skipped; the last is still open.
  for (const line of after.slice(1, -1)) {
    assert.equal(line.chunk?.status, 'done', `no translation ready for "${line.text}"`);
    assert.equal(chunkKey(line.chunk.translation), chunkKey(`[KO] ${line.text}`));
  }
  const okay = (lines) => lines.find((line) => line.text === 'Okay').at;
  assert.ok(okay(after) < okay(before) - 1, `"Okay" ended at ${okay(after)}, before ${okay(before)}`);
});

test('three-row pop-on captions on a live stream decode to the same windows as PlayerTextCue', async () => {
  const { raw, cues } = await fixture('live-cea608-8bitdee.json');
  const windows = [];
  const decoder = createCea608Decoder((pts, text) => windows.push([pts, text]));
  let frontier = -Infinity;
  for (const [, , pairs] of raw) {
    const before = frontier;
    for (const [pts, b1, b2] of pairs) {
      if (pts <= before) continue;
      decoder.push(pts, b1, b2);
      frontier = Math.max(frontier, pts);
    }
  }
  decoder.flush();
  const first = cues[0][0];
  const last = cues[cues.length - 1][0];
  const collapse = (list) => list.filter((item, i) => i === 0 || item[1] !== list[i - 1][1]);
  // Decoded times run up to 0.3 s ahead of cue positions, and the recording ends right after the
  // last cue.
  const decoded = collapse(windows.filter(([pts]) => pts >= first - 0.35 && pts <= last + 0.02));
  const shown = collapse(cues.map(([position, text]) => [position, text]));
  assert.deepEqual(
    decoded.map(([, text]) => text),
    shown.map(([, text]) => text)
  );
  decoded.forEach(([pts], i) => assert.ok(Math.abs(pts - shown[i][0]) < 0.35, `${pts} vs ${shown[i][0]}`));
});

test('on a live stream most chunks on screen find a translation requested ahead', async () => {
  const { raw, cues, buffered } = await fixture('live-cea608-8bitdee.json');
  // The recorded wall clock drives both paths, as in the controller: worker batches and the
  // buffered end feed the read-ahead, PlayerTextCue feeds the on-screen segmenter.
  const play = async (withPrefetch) => {
    let now = 0;
    let sample = buffered[0];
    let pending = '';
    const requested = new Set();
    const lines = [];
    let screen;
    const prefetch = createCaptionPrefetch({
      translate: async (texts) => {
        texts.forEach((text) => requested.add(chunkKey(text)));
        return texts.map((text) => `[KO] ${text}`);
      },
      onTranslation: () => {},
      onChunk: () => {
        if (pending && prefetch.isComplete(pending)) screen.commitPending(now);
      },
      position: () => sample[1],
    });
    screen = createSegmenter({
      onInterim: (text) => {
        pending = text;
        if (withPrefetch && text && prefetch.isComplete(text)) screen.commitPending(now);
      },
      onSentence: (sentence) => lines.push(prefetch.chunk(sentence.text)),
    });
    const end = cues[cues.length - 1][2] + 3000;
    for (let b = 0, r = 0, c = 0; now <= end; now += 100) {
      while (b < buffered.length && buffered[b][0] <= now) sample = buffered[b++];
      if (withPrefetch) {
        while (r < raw.length && raw[r][0] <= now) prefetch.add(raw[r][2], raw[r++][1]);
        if (sample[2] !== null) prefetch.advance(sample[2]);
      }
      while (c < cues.length && cues[c][2] <= now) {
        screen.push({ kind: 'snapshot', text: cues[c++][1].replace(/\r\n/g, ' '), at: now });
      }
      screen.tick(now);
      await new Promise((resolve) => setImmediate(resolve));
    }
    return { lines, requested };
  };
  const before = await play(false);
  const { lines, requested } = await play(true);
  const hits = lines.filter((chunk) => chunk?.status === 'done' || chunk?.status === 'pending').length;
  assert.ok(lines.length >= 8, `${lines.length} lines`);
  // Over two minutes of this stream 91% matched; the first chunk read is always skipped, and
  // re-worded windows split differently now and then.
  assert.ok(hits / lines.length >= 0.75, `${hits} of ${lines.length} lines found a translation`);
  // Ending chunks early must not split sentences into more lines ("I" matching a later "I").
  assert.ok(lines.length <= before.lines.length + 1, `${lines.length} lines, ${before.lines.length} without read-ahead`);
  // Misses are translated again on screen; read-ahead chunks that never show are extra requests.
  assert.ok(requested.size + (lines.length - hits) <= lines.length * 1.3, `${requested.size} requested ahead`);
});

test('a chunk read ahead matches the screen only around its own time', () => {
  // Pop-on windows: "warm up" (skipped as the first chunk), "I" at 10 s, other words, and "I"
  // again at 30 s.
  const pairs = [];
  const say = (pts, text) => {
    pairs.push([pts, 0x14, 0x2e], [pts, 0x14, 0x20], [pts, 0x14, 0x60]);
    for (let i = 0; i < text.length; i += 2) {
      pairs.push([pts, text.charCodeAt(i), i + 1 < text.length ? text.charCodeAt(i + 1) : 0]);
    }
    pairs.push([pts, 0x14, 0x2f]);
  };
  say(1, 'warm up');
  say(10, 'I');
  say(20, 'something else');
  say(30, 'I');
  let position = 0;
  const prefetch = createCaptionPrefetch({
    translate: null,
    onTranslation: () => {},
    onChunk: () => {},
    position: () => position,
  });
  prefetch.add(pairs, 0);
  prefetch.advance(40);
  position = 10.2;
  assert.equal(prefetch.isComplete('I'), false, 'the later "I" is the one remembered, at 30 s');
  position = 30.3;
  assert.equal(prefetch.isComplete('I'), true);
  position = 45;
  assert.equal(prefetch.isComplete('I'), false);
});

test('YouTube live caption lines lose speaker marks, and live recognition its repeated words', () => {
  assert.equal(joinCaptionLines(['>> ALL RIGHT. THESE WERE 40s ', 'FROM WHAT WAS '], false), 'ALL RIGHT. THESE WERE 40s FROM WHAT WAS');
  assert.equal(joinCaptionLines(['credits have sent premiums', 'premiums soaring This year'], true), 'credits have sent premiums soaring This year');
  // CEA-608 is typed by a person: a repeated word is meant.
  assert.equal(joinCaptionLines(['NO NO', 'NO'], false), 'NO NO NO');
  assert.equal(joinCaptionLines([], true), '');
});

test('YouTube live CEA-608 roll-up on screen becomes sentences', async () => {
  const { updates } = await fixture('live-cnn-608-dom.json', 'youtube');
  const { sentences, segmenter, now } = replay(updates.map(([at, lines]) => [at, joinCaptionLines(lines, false)]));
  segmenter.tick(now + 2000);
  assert.deepEqual(sentences, [
    'ALL RIGHT. THESE WERE 40s FROM WHAT WAS A 90 MINUTE RALLY IN NEBRASKA.',
    'BUT THOSE 40s DROVE THE MEDIA CONVERSATION FOR DAYS.',
    "NOW, THIS IS HAPPENING BECAUSE OF WHAT'S CALLED THE CLIPPING INDUSTRY.",
    'THESE ARE FOLKS THAT MAKE A LIVING BY WATCHING POLITICAL RALLIES AND CAMPAIGN',
    'EVENTS, AND POSTING HUNDREDS OF CLIPS ON SOCIAL MEDIA EVERY SINGLE DAY.',
    "I WANT EVERYBODY WHO'S CLIPPING THIS DEBATE ONLINE TONIGHT TO ROLL",
    'THAT TAPE. AARON RUPPERT IS AN INDEPENDENT JOURNALIST AND A TRUMP CRITIC WHO HAS',
    'BUILT UP A SIGNIFICANT FOLLOWING ON SOCIAL MEDIA AS A CLIPPER CHRONICLING TRUMP',
    'SINCE HE FIRST RAN IN 2016.',
    'IT WAS CLEAR TO',
  ]);
});

test("YouTube's live recognition shows two-line blocks; each becomes a chunk without repeated words", async () => {
  // The blocks replace each other every ~3 s without overlapping, so each ends what was pending.
  const { updates } = await fixture('live-cbs-asr-dom.json', 'youtube');
  const { sentences, segmenter, now } = replay(updates.map(([at, lines]) => [at, joinCaptionLines(lines, true)]), { blocks: true });
  segmenter.tick(now + 2000);
  assert.deepEqual(sentences, [
    'the',
    "road If you don't have employer coverage Affordable Care Act",
    'enrollment begins November 1st Rising health care',
    'costs and the expiration of enhanced premium tax',
    'credits have sent premiums soaring This year',
    'average monthly premium',
    'payments jumped 58% with another 15%',
    'increase predicted for 2027 On top of that the maximum',
    'out-ofpocket limit for individual coverage will climb',
    'by 13.2%',
    'to $12,000 To help offset these costs consider',
    'switching from a silver to a bronze plan which offers lower',
    'premiums but higher',
    'deductibles And check with your state because some are',
  ]);
});

// UMP's variable-length integers and protobuf varints, to build a SABR response around real segments.
const umpVarint = (v) =>
  v < 128 ? [v]
  : v < 2 ** 14 ? [0x80 | (v & 0x3f), v >> 6]
  : v < 2 ** 21 ? [0xc0 | (v & 0x1f), (v >> 5) & 0xff, v >> 13]
  : v < 2 ** 28 ? [0xe0 | (v & 0x0f), (v >> 4) & 0xff, (v >> 12) & 0xff, v >> 20]
  : [0xf0, v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24];
const protoVarint = (v) => { const out = []; do { out.push((v % 128) | (v >= 128 ? 0x80 : 0)); v = Math.floor(v / 128); } while (v > 0); return out; };
const umpPart = (type, payload) => [...umpVarint(type), ...umpVarint(payload.length), ...payload];
// MediaHeader as the player gets it: 1 header id, 2 video id (a string), 3 itag, 11 start ms, 13 format id (a message).
const mediaHeader = (id, itag, startMs) => {
  const videoId = [...Buffer.from('I9M1hVv8V_c.1')];
  const formatId = [8, ...protoVarint(itag), 16, ...protoVarint(1792651519396559)];
  return [8, ...protoVarint(id), 18, videoId.length, ...videoId, 24, ...protoVarint(itag), 88, ...protoVarint(startMs), 106, formatId.length, ...formatId];
};

test('a YouTube live caption segment holds srv3 lines in media time', async () => {
  const { segments } = await fixture('live-cbs-sabr.json', 'youtube');
  const cues = cuesFromSegment(Buffer.from(segments[1].hex, 'hex'), segments[1].startMs / 1000);
  assert.deepEqual(cues, [
    { start: 27970, end: 27971, text: 'America' },
    { start: 27971, end: 27974, text: "one day at a time. I'm Tony There are big questions that all" },
    { start: 27974, end: 27975, text: 'of us are' },
  ]);
});

test('SABR responses read in pieces keep only the live caption segments', async () => {
  const { segments } = await fixture('live-cbs-sabr.json', 'youtube');
  const caption = [...Buffer.from(segments[2].hex, 'hex')];
  const response = Uint8Array.from([
    ...umpPart(35, [1, 2, 3]),
    ...umpPart(20, mediaHeader(1, 140, segments[2].startMs)),
    ...umpPart(21, [1, ...Array.from({ length: 3000 }, (_, i) => i % 256)]),
    ...umpPart(22, [1]),
    ...umpPart(20, mediaHeader(1, 386, segments[2].startMs)),
    ...umpPart(21, [1, ...caption.slice(0, 500)]),
    ...umpPart(21, [1, ...caption.slice(500)]),
    ...umpPart(22, [1]),
  ]);
  const read = [];
  const reader = createUmpCaptionReader((cues) => read.push(...cues));
  for (let i = 0; i < response.length; i += 7) reader.push(response.subarray(i, i + 7));
  assert.deepEqual(read, cuesFromSegment(Uint8Array.from(caption), segments[2].startMs / 1000));
  assert.ok(read.length > 0);
});

test('YouTube live captions read from SABR are translated before they show', async () => {
  const { segments, dom } = await fixture('live-cbs-sabr.json', 'youtube');
  let now = dom[0][0] * 1000;
  const requested = [];
  let segmenter;
  let pending = '';
  const reader = createLiveCaptionReadAhead({
    asr: true,
    translate: async (texts) => { requested.push(...texts); return texts.map((text) => `[KO] ${text}`); },
    onTranslation: () => {},
    onChunk: () => { if (pending && reader.readAhead.isComplete(pending)) segmenter.commitPending(now); },
    position: () => now / 1000,
  });
  const lines = [];
  segmenter = createSegmenter({
    blocks: true,
    onInterim: (text) => { pending = text; if (reader.readAhead.isComplete(text)) segmenter.commitPending(now); },
    onSentence: (sentence) => lines.push({ text: sentence.text, at: now / 1000, chunk: reader.readAhead.chunk(sentence.text) }),
  });
  let next = 0;
  for (const [position, captionLines] of dom) {
    for (; now < position * 1000; now += 100) {
      segmenter.tick(now);
      while (next < segments.length && segments[next].arrivedAt * 1000 <= now) {
        const cues = cuesFromSegment(Buffer.from(segments[next].hex, 'hex'), segments[next].startMs / 1000);
        reader.add(cues.map((cue) => [cue.start, cue.end, cue.text]));
        next++;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    const text = joinCaptionLines(captionLines, true);
    if (text) segmenter.push({ kind: 'snapshot', text, at: now });
  }
  for (const end = now + 3000; now < end; now += 100) segmenter.tick(now);
  // The first chunk read is skipped (it may start mid-window); the last is still being read.
  assert.equal(lines.length, 16);
  for (const line of lines.slice(1, -1)) {
    assert.equal(line.chunk?.status, 'done', `no translation ready for "${line.text}"`);
    assert.equal(chunkKey(line.chunk.translation), chunkKey(`[KO] ${line.text}`));
  }
  // Committed as it shows (27980.15), not after the pause; "CBS Evening News" said 15 s earlier
  // doesn't pull it back.
  const cbs = lines.find((line) => line.text.startsWith('CBS Evening News.'));
  assert.ok(cbs.at < 27980.5, `committed at ${cbs.at}`);
  assert.ok(requested.length >= 14);
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
