import test from 'node:test';
import assert from 'node:assert/strict';
import { imageScale, imageTiles, MAX_IMAGE_SIDE, parseImageBlocks } from '../src/lib/imageTranslation.ts';

test('An ordinary image goes whole, scaled to the longest side the model reads', () => {
  assert.equal(imageScale(800, 600), 1);
  assert.equal(imageScale(3136, 2000), MAX_IMAGE_SIDE / 3136);
  assert.deepEqual(imageTiles(800, 600), [{ top: 0, height: 600, ownTop: 0, ownBottom: 600 }]);
});

test('A tall strip is cut into overlapping tiles that own its rows end to end', () => {
  // A webtoon strip keeps its width, not its height, under the limit.
  assert.equal(imageScale(800, 12000), 1);
  const tiles = imageTiles(800, 6000);
  assert.ok(tiles.length > 1);
  assert.equal(tiles[0].top, 0);
  assert.equal(tiles.at(-1).top + tiles.at(-1).height, 6000);
  assert.equal(tiles[0].ownTop, 0);
  assert.equal(tiles.at(-1).ownBottom, 6000);
  for (let i = 1; i < tiles.length; i++) {
    // Each overlaps the one before, and owns the rows from where that one's end.
    assert.ok(tiles[i].top < tiles[i - 1].top + tiles[i - 1].height);
    assert.equal(tiles[i].ownTop, tiles[i - 1].ownBottom);
    assert.ok(tiles[i].height <= 1200);
  }
});

test('The model answer becomes blocks of the whole image, fenced or not, in thousandths or fractions', () => {
  const whole = { top: 0, height: 1000, ownTop: 0, ownBottom: 1000 };
  const fenced = '```json\n{"blocks":[{"box":[100,200,300,600],"text":"こんにちは","translation":"안녕하세요"}]}\n```';
  assert.deepEqual(parseImageBlocks(fenced, whole, 1000), [
    { box: [0.1, 0.2, 0.3, 0.6], text: 'こんにちは', translation: '안녕하세요' },
  ]);
  const fractions = '{"blocks":[{"box":[0.5,0.1,0.25,0.4],"text":"Hi","translation":" 안녕 "}]}';
  // Swapped rows are put back in order.
  assert.deepEqual(parseImageBlocks(fractions, whole, 1000), [
    { box: [0.25, 0.1, 0.5, 0.4], text: 'Hi', translation: '안녕' },
  ]);
});

test('Blocks without a translation or a box, or centered outside the tile own rows, are dropped', () => {
  const tile = { top: 1000, height: 1000, ownTop: 1100, ownBottom: 1900 };
  const answer = JSON.stringify({
    blocks: [
      { box: [0, 0, 50, 500], text: 'overlap above', translation: '위' },
      { box: [400, 0, 500, 500], text: 'mine', translation: '내 것' },
      { box: [950, 0, 1000, 500], text: 'overlap below', translation: '아래' },
      { box: [400, 0, 500], text: 'bad box', translation: '나쁨' },
      { box: [400, 0, 500, 500], text: 'blank', translation: '  ' },
    ],
  });
  assert.deepEqual(parseImageBlocks(answer, tile, 4000), [
    { box: [1400 / 4000, 0, 1500 / 4000, 0.5], text: 'mine', translation: '내 것' },
  ]);
  assert.deepEqual(parseImageBlocks('I cannot read this image.', tile, 4000), []);
  assert.deepEqual(parseImageBlocks('{"blocks": nope}', tile, 4000), []);
});
