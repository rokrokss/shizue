import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const load = async (source) => {
  const outfile = fileURLToPath(new URL(`../.wxt/lecture-${randomUUID()}.mjs`, import.meta.url));
  await build({ entryPoints: [fileURLToPath(new URL(`../src/lib/${source}.ts`, import.meta.url))], outfile,
    bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
  after(() => rm(outfile, { force: true }));
  return import(pathToFileURL(outfile).href);
};
const { isIn, languageTag, loadTrackCaptions } = await load('trackCaptions/tracks');
const { isDomCaptionSite, lectureSiteFor, loadTedCaptions, streamingSiteFor, xSite } = await load('trackCaptions/sites');

const KO = 'Korean_한국어';

test('Each lecture site gets its own player, and other sites none', () => {
  for (const host of ['www.coursera.org', 'www.udemy.com', 'acme.udemy.com', 'www.ted.com', 'vimeo.com', 'player.vimeo.com']) {
    assert.equal(lectureSiteFor(host)?.name, 'lecture', host);
  }
  assert.equal(lectureSiteFor('www.youtube.com'), null);
  assert.equal(lectureSiteFor('evilvimeo.com'), null);
  assert.equal(lectureSiteFor('player.vimeo.com').ownCaptions, '.vp-captions');
  // Udemy draws its subtitles itself: they are read off the screen.
  assert.equal(isDomCaptionSite(lectureSiteFor('www.udemy.com')), true);
  assert.equal(isDomCaptionSite(lectureSiteFor('www.coursera.org')), false);
  assert.equal(xSite.name, 'x');
  assert.equal(xSite.zIndex, undefined);
});

test('Streaming services, and Prime Video on Amazon only under /gp/video', () => {
  for (const [host, path] of [['www.disneyplus.com', '/play/1'], ['www.primevideo.com', '/detail/x'], ['www.amazon.co.jp', '/gp/video/detail/B0'], ['play.hbomax.com', '/video/watch/1'], ['play.max.com', '/video/watch/1']]) {
    const site = streamingSiteFor(host, path);
    assert.equal(site?.name, 'streaming', host);
    assert.equal(isDomCaptionSite(site), true);
  }
  assert.equal(streamingSiteFor('www.amazon.com', '/dp/B0'), null);
  assert.equal(streamingSiteFor('www.netflix.com', '/watch/1'), null);
});

test('Sites write language tags in any case', () => {
  assert.equal(languageTag('zh-tw'), 'zh-TW');
  assert.equal(languageTag('pt-br'), 'pt-BR');
  assert.equal(languageTag('zh-Hant'), 'zh-Hant');
  assert.equal(isIn('zh-tw', 'ChineseTraditional_繁體中文'), true);
  assert.equal(isIn('zh-cn', 'ChineseSimplified_简体中文'), true);
  assert.equal(isIn('ko', KO), true);
  assert.equal(isIn('en', KO), false);
});

const cue = (startTime, endTime, text) => ({ startTime, endTime, text });
const track = (language, cues, mode = 'disabled', kind = 'subtitles') => {
  const t = { kind, language, label: language, _mode: mode, loaded: false };
  Object.defineProperty(t, 'mode', { get: () => t._mode, set: (m) => { t._mode = m; if (m !== 'disabled') t.loaded = true; } });
  // A track loads its cues once shown or hidden, as a <track> does.
  Object.defineProperty(t, 'cues', { get: () => (t._mode === 'disabled' && !t.loaded ? null : cues) });
  return t;
};
const videoWith = (...tracks) => ({ textTracks: tracks });

test('The track on, else English, is the original; one in the target language is its translation', async () => {
  const en = track('en', [cue(1, 2, 'Hello <b>class</b>'), cue(2, 3, 'Today:\nvectors')]);
  const ko = track('ko', [cue(1, 2, '안녕하세요'), cue(2, 3, '오늘은 벡터')]);
  const de = track('de', [cue(1, 2, 'Hallo'), cue(2, 3, 'Heute')]);
  const loaded = await loadTrackCaptions(videoWith(de, ko, en, track('en', [], 'disabled', 'chapters')), KO);
  assert.equal(loaded.language, 'en');
  assert.deepEqual(loaded.cues.map((c) => c.text), ['Hello class', 'Today: vectors']);
  assert.deepEqual(loaded.translations, ['안녕하세요', '오늘은 벡터']);
  assert.equal(en.mode, 'hidden');

  // The viewer has German on: that is what is spoken, as far as we know.
  const shown = await loadTrackCaptions(videoWith(track('en', [cue(1, 2, 'Hi')]), track('de', [cue(1, 2, 'Hallo')], 'showing')), 'French_Français');
  assert.equal(shown.language, 'de');
  assert.equal(shown.translations, undefined);

  // Only the target language: shown as it is.
  const only = await loadTrackCaptions(videoWith(track('ko', [cue(1, 2, '안녕')])), KO);
  assert.equal(only.language, 'ko');
  assert.equal(only.translations, undefined);

  assert.equal(await loadTrackCaptions(videoWith(), KO), null);
});

const tedPage = (player) => `<html><head></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: { pageProps: { videoData: { audioInternalLanguageCode: 'en', videoPlayerData: player } } },
})}</script></body></html>`;
const VTT = {
  en: 'WEBVTT\n\n00:00:05.607 --> 00:00:08.182\nGood morning. How are you?\n\n00:00:08.206 --> 00:00:09.609\n(Audience) Good.\n',
  ko: 'WEBVTT\n\n00:00:05.607 --> 00:00:08.182\n안녕하세요. 잘 지내셨어요?\n\n00:00:08.206 --> 00:00:09.609\n(청중) 네.\n',
};
const withFetch = async (routes, run) => {
  const previous = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    const body = routes[String(url)];
    if (body === undefined) return new Response('missing', { status: 404 });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body));
  };
  try { await run(asked); } finally { globalThis.fetch = previous; }
};

test('TED: the spoken language from the talk page, and TED\'s own translation when it has one', async () => {
  const meta = 'https://hls.ted.com/project_masters/1253/metadata.json?intro_master_id=9294';
  const vtt = (code) => `https://hls.ted.com/project_masters/1253/subtitles/${code}/full.vtt`;
  const routes = {
    'https://www.ted.com/talks/a_talk': tedPage(JSON.stringify({ nativeLanguage: 'en', resources: { hls: { metadata: meta } } })),
    [meta]: { subtitles: ['ko', 'en', 'zh-tw'].map((code) => ({ code, name: code, webvtt: vtt(code) })) },
    [vtt('en')]: VTT.en,
    [vtt('ko')]: VTT.ko,
  };
  await withFetch(routes, async (asked) => {
    const korean = await loadTedCaptions(KO, 'https://www.ted.com/talks/a_talk');
    assert.equal(korean.language, 'en');
    assert.deepEqual(korean.cues.map((c) => c.text), ['Good morning. How are you?', '(Audience) Good.']);
    assert.equal(Math.round(korean.cues[0].startTime * 1000), 5607);
    assert.deepEqual(korean.translations, ['안녕하세요. 잘 지내셨어요?', '(청중) 네.']);
    assert.ok(asked.includes(vtt('ko')));

    // No German on TED: the LLM translates the English.
    const german = await loadTedCaptions('German_Deutsch', 'https://www.ted.com/talks/a_talk');
    assert.equal(german.translations, undefined);
    // Traditional Chinese, written zh-tw by TED, is found, though its file is missing: English alone.
    const chinese = await loadTedCaptions('ChineseTraditional_繁體中文', 'https://www.ted.com/talks/a_talk');
    assert.equal(chinese.translations, undefined);
    assert.ok(asked.includes(vtt('zh-tw')));
  });

  await withFetch({ 'https://www.ted.com/talks/none': '<html>no data</html>' }, async () => {
    assert.equal(await loadTedCaptions(KO, 'https://www.ted.com/talks/none'), null);
  });
});
