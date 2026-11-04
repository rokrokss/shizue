import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const load = async (source) => {
  const outfile = fileURLToPath(new URL(`../.wxt/meeting-${randomUUID()}.mjs`, import.meta.url));
  await build({ entryPoints: [fileURLToPath(new URL(`../src/lib/${source}.ts`, import.meta.url))], outfile,
    bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
  after(() => rm(outfile, { force: true }));
  return import(pathToFileURL(outfile).href);
};
const { createMeetingTranscript } = await load('meetingCaptions/transcript');
const { meetingSiteFor } = await load('meetingCaptions/sites');
const { detectLanguage } = await load('textLanguage');

const run = (steps) => {
  const lines = [];
  const interims = [];
  const transcript = createMeetingTranscript({
    onLine: (line) => lines.push(`${line.speaker}: ${line.text}`),
    onInterim: (speaker, text) => interims.push([speaker, text]),
  });
  let now = 0;
  for (const [at, blocks] of steps) {
    for (; now < at; now += 100) transcript.tick(now);
    if (blocks === null) transcript.flush(at);
    else transcript.update(blocks, at);
  }
  return { lines, interims, transcript };
};

test('A growing turn becomes lines under its speaker; a new turn commits the last one', () => {
  const a = {}; const b = {};
  const { lines } = run([
    [0, [{ key: a, speaker: 'Ana', text: 'Good morning' }]],
    [300, [{ key: a, speaker: 'Ana', text: 'Good morning everyone, thanks for joining. Let us start with' }]],
    [700, [{ key: a, speaker: 'Ana', text: 'Good morning everyone, thanks for joining. Let us start with the budget' }]],
    // Ana's block is corrected while Ben speaks: only the newest turn is read.
    [900, [{ key: a, speaker: 'Ana', text: 'Good morning, everyone. Thanks for joining. Let us start with the budget.' }, { key: b, speaker: 'Ben', text: 'Sure' }]],
    [1100, [{ key: a, speaker: 'Ana', text: 'x' }, { key: b, speaker: 'Ben', text: 'Sure, I have the numbers here' }]],
    [4000, [{ key: a, speaker: 'Ana', text: 'x' }, { key: b, speaker: 'Ben', text: 'Sure, I have the numbers here' }]],
  ]);
  assert.deepEqual(lines, [
    'Ana: Good morning everyone, thanks for joining.',
    'Ana: Let us start with the budget',
    'Ben: Sure, I have the numbers here',
  ]);
});

test('A name filled in after the turn started is on its lines, and turning captions off commits', () => {
  const a = {};
  const { lines, interims } = run([
    [0, [{ key: a, speaker: '', text: 'We shipped it' }]],
    [200, [{ key: a, speaker: 'Kim', text: 'We shipped it yesterday' }]],
    [400, null],
  ]);
  assert.deepEqual(lines, ['Kim: We shipped it yesterday']);
  assert.ok(interims.some(([speaker, text]) => speaker === 'Kim' && text === 'We shipped it yesterday'));
});

test('Each meeting site, and Zoom only in its web client', () => {
  assert.equal(meetingSiteFor('meet.google.com', '/abc-defg-hij').name, 'meet');
  assert.equal(meetingSiteFor('teams.microsoft.com', '/v2/').name, 'teams');
  assert.equal(meetingSiteFor('teams.live.com', '/meet/1').name, 'teams');
  assert.equal(meetingSiteFor('app.zoom.us', '/wc/123/join').name, 'zoom');
  assert.equal(meetingSiteFor('us05web.zoom.us', '/wc/123/start').name, 'zoom');
  assert.equal(meetingSiteFor('zoom.us', '/pricing'), null);
  assert.equal(meetingSiteFor('example.com', '/wc/1'), null);
});

test('The spoken language is told by its script without a detector', async () => {
  assert.equal(await detectLanguage('안녕하세요 여러분, 회의를 시작하겠습니다'), 'ko');
  assert.equal(await detectLanguage('今日はよろしくお願いします'), 'ja');
  assert.equal(await detectLanguage('我们开始开会吧'), 'zh');
  // Latin text needs Chrome's detector, which node lacks.
  assert.equal(await detectLanguage('Good morning everyone, let us start'), null);
  assert.equal(await detectLanguage('123'), null);
});
