// Image translation: the image goes to the chat model, which answers with each block of text, its
// box and its translation (prompts.ts, getImageTranslationPrompt), drawn over the image by
// imageTranslator.ts. A tall image (a webtoon strip, a long screenshot) is sent in tiles that
// overlap a little, so its text isn't shrunk past reading; a block is kept from the tile it
// is centered in. Pure, for the background and the tests.

export type ImageTextBlock = {
  // [top, left, bottom, right] as fractions of the whole image.
  box: [number, number, number, number];
  text: string;
  translation: string;
};

export type ImageTile = {
  // Pixel rows of the (scaled) image this tile covers.
  top: number;
  height: number;
  // The rows it owns: blocks centered there come from this tile.
  ownTop: number;
  ownBottom: number;
};

// The longest side the model gets; more costs tokens without helping it read.
export const MAX_IMAGE_SIDE = 1568;
// Tiles are at most this tall for their width.
const TILE_RATIO = 1.5;
const TILE_OVERLAP = 0.12;
const MAX_TILES = 12;

// The scale that fits the image's width, or its longest side when it is not tall.
export const imageScale = (width: number, height: number) => {
  const tall = height / width > TILE_RATIO;
  const side = tall ? width : Math.max(width, height);
  return Math.min(1, MAX_IMAGE_SIDE / side);
};

export const imageTiles = (width: number, height: number): ImageTile[] => {
  const tileHeight = Math.round(width * TILE_RATIO);
  if (height <= tileHeight * 1.05) return [{ top: 0, height, ownTop: 0, ownBottom: height }];
  const overlap = Math.round(tileHeight * TILE_OVERLAP);
  const step = tileHeight - overlap;
  const count = Math.min(MAX_TILES, Math.ceil((height - overlap) / step));
  const tiles: ImageTile[] = [];
  for (let i = 0; i < count; i++) {
    const top = Math.min(i * step, Math.max(0, height - tileHeight));
    const bottom = Math.min(height, top + tileHeight);
    tiles.push({ top, height: bottom - top, ownTop: 0, ownBottom: 0 });
  }
  // A tile owns the rows from the middle of its overlap with the one before to the middle of its
  // overlap with the one after.
  tiles.forEach((tile, i) => {
    const previous = tiles[i - 1];
    const next = tiles[i + 1];
    tile.ownTop = previous ? Math.round((tile.top + previous.top + previous.height) / 2) : 0;
    tile.ownBottom = next ? Math.round((next.top + tile.top + tile.height) / 2) : height;
  });
  return tiles;
};

// The model's JSON, fenced or not, as blocks of the whole image (`height` px tall) from `tile`.
export const parseImageBlocks = (answer: string, tile: ImageTile, height: number): ImageTextBlock[] => {
  const json = answer.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const blocks = (parsed as { blocks?: unknown })?.blocks;
  if (!Array.isArray(blocks)) return [];
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return blocks.flatMap((block) => {
    const { box, text, translation } = (block ?? {}) as { box?: unknown; text?: unknown; translation?: unknown };
    if (!Array.isArray(box) || box.length !== 4 || !box.every((n) => typeof n === 'number' && Number.isFinite(n))) return [];
    if (typeof translation !== 'string' || !translation.trim()) return [];
    // Some models answer in fractions rather than thousandths.
    const scale = box.every((n) => n <= 1) ? 1 : 1000;
    let [ymin, xmin, ymax, xmax] = box.map((n) => clamp(n / scale));
    if (ymax < ymin) [ymin, ymax] = [ymax, ymin];
    if (xmax < xmin) [xmin, xmax] = [xmax, xmin];
    if (ymax - ymin < 0.002 || xmax - xmin < 0.002) return [];
    const top = tile.top + ymin * tile.height;
    const bottom = tile.top + ymax * tile.height;
    const center = (top + bottom) / 2;
    if (center < tile.ownTop || center >= tile.ownBottom) return [];
    return [
      {
        box: [top / height, xmin, bottom / height, xmax] as ImageTextBlock['box'],
        text: typeof text === 'string' ? text.trim() : '',
        translation: translation.trim(),
      },
    ];
  });
};
