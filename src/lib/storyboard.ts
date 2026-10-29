// YouTube's storyboard: the small frames its seek bar previews, laid out in sprite sheets. A video
// summary shows the frame at each section's time, so no frame is captured and no tokens are spent.
//
// The spec (the player's storyboards.playerStoryboardSpecRenderer.spec) is a sheet address template
// and then one level per '|', smallest first:
// https://i.ytimg.com/sb/<id>/storyboard3_L$L/$N.jpg?sqp=…|48#27#100#10#10#0#default#rs$…|…|
// 320#180#108#3#3#2000#M$M#rs$…
// Each level is width#height#frame count#columns#rows#interval in ms#sheet name#signature. Level 0
// spreads its frames over the whole video (interval 0); the others take one every interval.

export interface StoryboardFrame {
  // The sprite sheet that holds the frame.
  url: string;
  width: number;
  height: number;
  columns: number;
  column: number;
  row: number;
}

// The frame shown at `seconds`, from the sharpest level that takes frames at an interval, or null
// when the spec has none.
export const storyboardFrame = (spec: string, seconds: number): StoryboardFrame | null => {
  const [base, ...levels] = spec.split('|');
  if (!base?.startsWith('https://') || !base.includes('$L')) return null;
  for (let level = levels.length - 1; level >= 0; level--) {
    const fields = levels[level].split('#');
    const [width, height, count, columns, rows, interval] = fields.slice(0, 6).map(Number);
    const [name, signature] = fields.slice(6);
    const sizes = [width, height, count, columns, rows, interval];
    if (!name || !sizes.every((size) => Number.isInteger(size) && size > 0)) continue;
    const frame = Math.min(count - 1, Math.max(0, Math.floor((seconds * 1000) / interval)));
    const perSheet = columns * rows;
    const index = frame % perSheet;
    const sheet = name.replace('$M', String(Math.floor(frame / perSheet)));
    const url = base.replace('$L', String(level)).replace('$N', () => sheet);
    return {
      url: signature ? `${url}${url.includes('?') ? '&' : '?'}sigh=${signature}` : url,
      width,
      height,
      columns,
      column: index % columns,
      row: Math.floor(index / columns),
    };
  }
  return null;
};
