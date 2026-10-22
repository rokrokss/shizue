// YouTube's web player streams media over SABR: each response is a UMP stream of parts (the format
// the MIT googlevideo package documents). A live stream's captions come in it as itag 386, 5 s
// segments of fMP4 whose one tx3g sample is YouTube's own timedtext (srv3) XML, 12–21 s before
// they show. youtube-player-hook.content reads the player's responses with this.

export const LIVE_CAPTION_ITAG = 386;

const MEDIA_HEADER = 20;
const MEDIA = 21;
const MEDIA_END = 22;

// A caption line in media seconds.
export type LiveCaptionCue = { start: number; end: number; text: string };

const EMPTY = new Uint8Array(0);

// UMP's own variable-length integers: the first byte says how many bytes follow.
export const readUmpVarint = (bytes: Uint8Array, pos: number): [number, number] | null => {
  if (pos >= bytes.length) return null;
  const b0 = bytes[pos];
  const size = b0 < 128 ? 1 : b0 < 192 ? 2 : b0 < 224 ? 3 : b0 < 240 ? 4 : 5;
  if (pos + size > bytes.length) return null;
  const b = (i: number) => bytes[pos + i];
  let value: number;
  if (size === 1) value = b0;
  else if (size === 2) value = (b0 & 0x3f) + 64 * b(1);
  else if (size === 3) value = (b0 & 0x1f) + 32 * (b(1) + 256 * b(2));
  else if (size === 4) value = (b0 & 0x0f) + 16 * (b(1) + 256 * (b(2) + 256 * b(3)));
  else value = b(1) + 256 * (b(2) + 256 * (b(3) + 256 * b(4)));
  return [value, pos + size];
};

// The varint fields of a protobuf message (enough for MediaHeader: 1 header id, 3 itag, 11 start ms).
const protobufVarints = (bytes: Uint8Array) => {
  const fields = new Map<number, number>();
  let pos = 0;
  const varint = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = bytes[pos++];
      result += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80 && pos < bytes.length);
    return result;
  };
  while (pos < bytes.length) {
    const key = varint();
    const wire = key & 7;
    if (wire === 0) {
      const field = Math.floor(key / 8);
      const value = varint();
      if (!fields.has(field)) fields.set(field, value);
    } else if (wire === 2) {
      // Read the length first: `pos += varint()` would add it to the position before the length.
      const length = varint();
      pos += length;
    } else if (wire === 1) pos += 8;
    else if (wire === 5) pos += 4;
    else break;
  }
  return fields;
};

const concat = (parts: Uint8Array[]) => {
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeEntities = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    return ENTITIES[name.toLowerCase()] ?? entity;
  });

// The lines of one caption segment (fMP4) that starts at `startSeconds`. Its mdat is srv3:
// <p t="ms" d="ms">text</p>, times from the segment start; a <p> is a block of lines on screen.
export const cuesFromSegment = (segment: Uint8Array, startSeconds: number): LiveCaptionCue[] => {
  let pos = 0;
  let xml = '';
  while (pos + 8 <= segment.length) {
    const size = ((segment[pos] << 24) >>> 0) + (segment[pos + 1] << 16) + (segment[pos + 2] << 8) + segment[pos + 3];
    const type = String.fromCharCode(segment[pos + 4], segment[pos + 5], segment[pos + 6], segment[pos + 7]);
    const end = size === 0 ? segment.length : pos + size;
    if (size !== 0 && size < 8) break;
    if (type === 'mdat') xml += new TextDecoder().decode(segment.subarray(pos + 8, Math.min(end, segment.length)));
    pos = end;
  }
  const cues: LiveCaptionCue[] = [];
  for (const match of xml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const t = /\bt="(\d+)"/.exec(match[1]);
    if (!t) continue;
    const d = /\bd="(\d+)"/.exec(match[1]);
    const text = decodeEntities(match[2].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const start = startSeconds + Number(t[1]) / 1000;
    cues.push({ start, end: start + Number(d?.[1] ?? 0) / 1000, text });
  }
  return cues;
};

// Reads one SABR response as it streams in, keeping only the live caption segments. Everything else
// (the audio and video) is skipped, not kept.
export function createUmpCaptionReader(onCues: (cues: LiveCaptionCue[]) => void) {
  // Caption segments being received, by MediaHeader id (ids are reused within a response).
  const segments = new Map<number, { start: number; parts: Uint8Array[] }>();
  let leftover = EMPTY;
  let skip = 0;
  let collecting: { type: number; remaining: number; parts: Uint8Array[] } | null = null;

  const handle = (type: number, payload: Uint8Array) => {
    if (type === MEDIA_HEADER) {
      const fields = protobufVarints(payload);
      const id = fields.get(1);
      const startMs = fields.get(11);
      if (id === undefined) return;
      if (fields.get(3) === LIVE_CAPTION_ITAG && startMs !== undefined) segments.set(id, { start: startMs / 1000, parts: [] });
      else segments.delete(id);
    } else if (type === MEDIA) {
      const id = readUmpVarint(payload, 0);
      if (id) segments.get(id[0])?.parts.push(payload.slice(id[1]));
    } else if (type === MEDIA_END) {
      const id = readUmpVarint(payload, 0);
      const segment = id && segments.get(id[0]);
      if (!id || !segment) return;
      segments.delete(id[0]);
      const cues = cuesFromSegment(concat(segment.parts), segment.start);
      if (cues.length) onCues(cues);
    }
  };

  // Headers and ends are small; a media part is kept only when its header was a caption one.
  const wanted = (type: number, head: Uint8Array) => {
    if (type === MEDIA_HEADER || type === MEDIA_END) return true;
    if (type !== MEDIA) return false;
    const id = readUmpVarint(head, 0);
    return !!id && segments.has(id[0]);
  };

  return {
    push(chunk: Uint8Array) {
      const data = leftover.length ? concat([leftover, chunk]) : chunk;
      leftover = EMPTY;
      let pos = 0;
      while (pos < data.length) {
        if (skip) {
          const n = Math.min(skip, data.length - pos);
          skip -= n;
          pos += n;
          continue;
        }
        if (collecting) {
          const n = Math.min(collecting.remaining, data.length - pos);
          collecting.parts.push(data.slice(pos, pos + n));
          collecting.remaining -= n;
          pos += n;
          if (!collecting.remaining) {
            const { type, parts } = collecting;
            collecting = null;
            handle(type, concat(parts));
          }
          continue;
        }
        const type = readUmpVarint(data, pos);
        const size = type && readUmpVarint(data, type[1]);
        // The part's own header is split across chunks, or a media part's first bytes (whose
        // segment it is) haven't arrived yet.
        if (!type || !size || (type[0] === MEDIA && data.length - size[1] < Math.min(size[0], 5))) {
          leftover = data.slice(pos);
          return;
        }
        pos = size[1];
        const keep = wanted(type[0], data.subarray(pos, pos + Math.min(size[0], 5)));
        if (!size[0]) {
          if (keep) handle(type[0], EMPTY);
        } else if (keep) {
          collecting = { type: type[0], remaining: size[0], parts: [] };
        } else {
          skip = size[0];
        }
      }
    },
  };
}
