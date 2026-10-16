// Decodes CEA-608 field 1, data channel 1 (CC1) into what a caption display shows, the way Twitch's
// player reports it in PlayerTextCue: the shown rows, top to bottom, joined by "\r\n". It is fed the
// byte pairs `captionExtractor.ts` pulls from the player's buffered video, ahead of playback.
//
// Encoders differ: the OBS caption plugin seen on Twitch writes pop-on captions (two rows into
// hidden memory, then shows them with EOC); others roll up or paint on. Where Twitch's player
// departs from the standard, this follows the player, because prefetched text has to match the
// PlayerTextCue text it is later compared with.

const ROWS = 15;
const COLUMNS = 32;

// Basic characters that differ from ASCII.
const BASIC: Record<number, string> = {
  0x2a: 'á',
  0x5c: 'é',
  0x5e: 'í',
  0x5f: 'ó',
  0x60: 'ú',
  0x7b: 'ç',
  0x7c: '÷',
  0x7d: 'Ñ',
  0x7e: 'ñ',
  0x7f: '█',
};
// 0x11 0x30–0x3F.
const SPECIAL = '®°½¿™¢£♪à èâêîôû';
// 0x12 0x20–0x3F, then 0x13 0x20–0x3F. Each replaces the character sent before it (the OBS plugin
// sends a space there). Twitch's player shows straight quotes, so these do too.
const EXTENDED =
  'ÁÉÓÚÜü\'¡*\'—©℠•""ÀÂÇÈÊËëÎÏïÔÙùÛ«»' + 'ÃãÍÌìÒòÕõ{}\\^_|~ÄäÖöß¥¤│ÅåØø┌┐└┘';
// PAC rows (0-based) by first byte, for second bytes 0x40–0x5F and 0x60–0x7F.
const PAC_ROWS: Record<number, [number, number]> = {
  0x11: [0, 1],
  0x12: [2, 3],
  0x15: [4, 5],
  0x16: [6, 7],
  0x17: [8, 9],
  0x10: [10, 10],
  0x13: [11, 12],
  0x14: [13, 14],
};

type Mode = 'popOn' | 'rollUp' | 'paintOn' | 'text';

export function createCea608Decoder(onWindow: (pts: number, text: string) => void) {
  const blank = () => Array.from({ length: ROWS }, () => Array<string>(COLUMNS).fill(' '));
  let displayed = blank();
  let hidden = blank();
  let mode: Mode = 'popOn';
  let rollUpRows = 2;
  let row = ROWS - 1;
  let column = 0;
  let channel = 1;
  let lastControl = -1;
  let shown = '';
  // Like Twitch's player, report what a frame ends with: a caption shown and erased within one
  // frame never appears.
  let framePts = NaN;

  const target = () => (mode === 'popOn' ? hidden : displayed);

  const show = (pts: number) => {
    const text = displayed
      .map((cells) => cells.join('').trim())
      .filter(Boolean)
      .join('\r\n');
    if (text === shown) return;
    shown = text;
    onWindow(pts, text);
  };

  const write = (char: string) => {
    if (mode === 'text') return;
    if (column < COLUMNS) target()[row][column] = char;
    column = Math.min(column + 1, COLUMNS);
  };

  const backspace = () => {
    if (column === 0) return;
    column--;
    target()[row][column] = ' ';
  };

  const rollUp = () => {
    const top = Math.max(0, row - rollUpRows + 1);
    for (let r = 0; r < ROWS; r++) {
      if (r < top || r > row) displayed[r].fill(' ');
    }
    for (let r = top; r < row; r++) displayed[r] = displayed[r + 1];
    displayed[row] = Array<string>(COLUMNS).fill(' ');
    column = 0;
  };

  const control = (b1: number, b2: number) => {
    const misc = b1 === 0x14 || b1 === 0x15;
    if (b1 in PAC_ROWS && b2 >= 0x40) {
      const pacRow = PAC_ROWS[b1][b2 >= 0x60 ? 1 : 0];
      if (mode === 'rollUp' && pacRow !== row) {
        // The roll-up window moves with its base row.
        const moved = blank();
        for (let i = 0; i < rollUpRows; i++) {
          if (row - i >= 0 && pacRow - i >= 0) moved[pacRow - i] = displayed[row - i];
        }
        displayed = moved;
      }
      row = pacRow;
      // Indent PACs carry the column in steps of 4.
      column = b2 & 0x10 ? ((b2 & 0x0e) >> 1) * 4 : 0;
      return;
    }
    if (b1 === 0x11 && b2 >= 0x20 && b2 <= 0x2f) {
      write(' ');
      return;
    }
    if (b1 === 0x11 && b2 >= 0x30 && b2 <= 0x3f) {
      write(SPECIAL[b2 - 0x30]);
      return;
    }
    if ((b1 === 0x12 || b1 === 0x13) && b2 >= 0x20 && b2 <= 0x3f) {
      backspace();
      write(EXTENDED[(b1 - 0x12) * 32 + (b2 - 0x20)]);
      return;
    }
    if (b1 === 0x17 && b2 >= 0x21 && b2 <= 0x23) {
      column = Math.min(column + (b2 - 0x20), COLUMNS);
      return;
    }
    if (!misc || b2 < 0x20 || b2 > 0x2f) return;
    switch (b2) {
      case 0x20: // RCL: pop-on
        mode = 'popOn';
        break;
      case 0x21: // BS
        backspace();
        break;
      case 0x24: // DER: delete to end of row
        target()[row].fill(' ', column);
        break;
      case 0x25: // RU2–RU4
      case 0x26:
      case 0x27:
        if (mode !== 'rollUp') displayed = blank();
        mode = 'rollUp';
        rollUpRows = b2 - 0x23;
        column = 0;
        break;
      case 0x29: // RDC: paint-on
        mode = 'paintOn';
        break;
      case 0x2a: // TR, RTD: text mode, never shown
      case 0x2b:
        mode = 'text';
        break;
      case 0x2c: // EDM: erase what is shown
        displayed = blank();
        break;
      case 0x2d: // CR
        if (mode === 'rollUp') rollUp();
        break;
      case 0x2e: // ENM: erase hidden memory
        hidden = blank();
        break;
      case 0x2f: // EOC: show hidden memory. The standard swaps the two; Twitch's player empties
        // hidden memory instead, so a second EOC shows nothing.
        displayed = hidden;
        hidden = blank();
        mode = 'popOn';
        break;
    }
  };

  return {
    // A byte pair (parity removed) at its presentation time in seconds, in presentation order.
    push(pts: number, b1: number, b2: number) {
      if (pts !== framePts) {
        if (!Number.isNaN(framePts)) show(framePts);
        framePts = pts;
      }
      if (b1 >= 0x10 && b1 <= 0x1f) {
        const code = (b1 << 8) | b2;
        // Control codes are sent twice for robustness; the repeat does nothing.
        if (code === lastControl) {
          lastControl = -1;
          return;
        }
        lastControl = code;
        channel = b1 >= 0x18 ? 2 : 1;
        if (channel === 1) control(b1, b2);
      } else {
        lastControl = -1;
        if (channel === 1) {
          for (const b of [b1, b2]) if (b >= 0x20) write(BASIC[b] ?? String.fromCharCode(b));
        }
      }
    },
    // Reports the last frame pushed; call it after each batch of pairs.
    flush() {
      if (!Number.isNaN(framePts)) show(framePts);
    },
    // A seek or channel change: what was shown no longer continues.
    reset() {
      displayed = blank();
      hidden = blank();
      mode = 'popOn';
      row = ROWS - 1;
      column = 0;
      channel = 1;
      lastControl = -1;
      shown = '';
      framePts = NaN;
    },
  };
}

export type Cea608Decoder = ReturnType<typeof createCea608Decoder>;
