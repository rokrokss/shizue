// Pulls the broadcaster's CEA-608 captions out of the video Twitch's player appends to its
// SourceBuffer, which runs 1–3 s ahead of playback on live streams and 10–35 s on VODs.
//
// This runs inside Twitch's player worker: `twitch-player-worker.content` stringifies it into the
// worker's source. Keep it self-contained, with no imports and nothing from module scope.
export function createCaptionExtractor() {
  // The video track of the latest initialization segment (a quality switch sends a new one).
  let trackId = 0;
  let timescale = 0;
  let defaultDuration = 0;

  const type = (u8: Uint8Array, at: number) =>
    String.fromCharCode(u8[at], u8[at + 1], u8[at + 2], u8[at + 3]);

  type Box = { type: string; start: number; end: number; data: number };
  const boxes = (dv: DataView, u8: Uint8Array, start: number, end: number): Box[] => {
    const out: Box[] = [];
    for (let at = start; at + 8 <= end; ) {
      let size = dv.getUint32(at);
      let header = 8;
      if (size === 1) {
        size = Number(dv.getBigUint64(at + 8));
        header = 16;
      } else if (size === 0) {
        size = end - at;
      }
      if (size < header || at + size > end) break;
      out.push({ type: type(u8, at + 4), start: at, end: at + size, data: at + header });
      at += size;
    }
    return out;
  };
  const child = (dv: DataView, u8: Uint8Array, box: Box, name: string) =>
    boxes(dv, u8, box.data, box.end).find((b) => b.type === name);

  const readInit = (dv: DataView, u8: Uint8Array, moov: Box) => {
    for (const trak of boxes(dv, u8, moov.data, moov.end)) {
      if (trak.type !== 'trak') continue;
      const mdia = child(dv, u8, trak, 'mdia');
      const hdlr = mdia && child(dv, u8, mdia, 'hdlr');
      const mdhd = mdia && child(dv, u8, mdia, 'mdhd');
      const tkhd = child(dv, u8, trak, 'tkhd');
      if (!hdlr || !mdhd || !tkhd || type(u8, hdlr.data + 8) !== 'vide') continue;
      timescale = dv.getUint32(mdhd.data + (u8[mdhd.data] === 1 ? 20 : 12));
      trackId = dv.getUint32(tkhd.data + (u8[tkhd.data] === 1 ? 20 : 12));
      defaultDuration = 0;
    }
    const mvex = child(dv, u8, moov, 'mvex');
    for (const trex of mvex ? boxes(dv, u8, mvex.data, mvex.end) : []) {
      if (trex.type === 'trex' && dv.getUint32(trex.data + 4) === trackId) {
        defaultDuration = dv.getUint32(trex.data + 12);
      }
    }
  };

  // CEA-608 field 1 byte pairs (A/53 cc_data in an ITU-T T.35 SEI message), parity removed.
  const readSei = (u8: Uint8Array, start: number, end: number, pts: number, out: number[][]) => {
    const rbsp: number[] = [];
    for (let i = start + 1, zeros = 0; i < end; i++) {
      if (zeros >= 2 && u8[i] === 3) {
        zeros = 0;
        continue;
      }
      rbsp.push(u8[i]);
      zeros = u8[i] === 0 ? zeros + 1 : 0;
    }
    for (let at = 0; at < rbsp.length && rbsp[at] !== 0x80; ) {
      let payloadType = 0;
      while (rbsp[at] === 0xff) payloadType += rbsp[at++];
      payloadType += rbsp[at++];
      let size = 0;
      while (rbsp[at] === 0xff) size += rbsp[at++];
      size += rbsp[at++];
      const isCaptions =
        payloadType === 4 &&
        rbsp[at] === 0xb5 &&
        ((rbsp[at + 1] << 8) | rbsp[at + 2]) === 0x31 &&
        String.fromCharCode(rbsp[at + 3], rbsp[at + 4], rbsp[at + 5], rbsp[at + 6]) === 'GA94' &&
        rbsp[at + 7] === 3;
      if (isCaptions) {
        const count = rbsp[at + 8] & 0x1f;
        for (let i = 0, q = at + 10; i < count && q + 2 < at + size; i++, q += 3) {
          const valid = rbsp[q] & 4;
          const field1 = (rbsp[q] & 3) === 0;
          const b1 = rbsp[q + 1] & 0x7f;
          const b2 = rbsp[q + 2] & 0x7f;
          if (valid && field1 && (b1 || b2)) out.push([pts, b1, b2]);
        }
      }
      at += size;
    }
  };

  return {
    // `bytes` was appended to a SourceBuffer whose timestampOffset was `offset`. Returns
    // [presentation time in seconds, byte 1, byte 2] in presentation order.
    extract(bytes: Uint8Array, offset: number): number[][] {
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const top = boxes(dv, bytes, 0, bytes.length);
      const moov = top.find((b) => b.type === 'moov');
      if (moov) readInit(dv, bytes, moov);
      if (!timescale) return [];
      const frames: [number, number, number][] = [];
      for (const moof of top) {
        if (moof.type !== 'moof') continue;
        for (const traf of boxes(dv, bytes, moof.data, moof.end)) {
          if (traf.type !== 'traf') continue;
          const tfhd = child(dv, bytes, traf, 'tfhd');
          if (!tfhd || dv.getUint32(tfhd.data + 4) !== trackId) continue;
          const tfhdFlags = dv.getUint32(tfhd.data) & 0xffffff;
          let at = tfhd.data + 8;
          let base = moof.start;
          if (tfhdFlags & 0x1) {
            base = Number(dv.getBigUint64(at));
            at += 8;
          }
          if (tfhdFlags & 0x2) at += 4;
          let duration = defaultDuration;
          let size = 0;
          if (tfhdFlags & 0x8) {
            duration = dv.getUint32(at);
            at += 4;
          }
          if (tfhdFlags & 0x10) size = dv.getUint32(at);
          const tfdt = child(dv, bytes, traf, 'tfdt');
          let dts = 0;
          if (tfdt) {
            dts = bytes[tfdt.data] === 1 ? Number(dv.getBigUint64(tfdt.data + 4)) : dv.getUint32(tfdt.data + 4);
          }
          for (const trun of boxes(dv, bytes, traf.data, traf.end)) {
            if (trun.type !== 'trun') continue;
            const version = bytes[trun.data];
            const flags = dv.getUint32(trun.data) & 0xffffff;
            const count = dv.getUint32(trun.data + 4);
            let p = trun.data + 8;
            let dataOffset = 0;
            if (flags & 0x1) {
              dataOffset = dv.getInt32(p);
              p += 4;
            }
            if (flags & 0x4) p += 4;
            let sample = base + dataOffset;
            for (let i = 0; i < count; i++) {
              let sampleDuration = duration;
              let sampleSize = size;
              let cto = 0;
              if (flags & 0x100) {
                sampleDuration = dv.getUint32(p);
                p += 4;
              }
              if (flags & 0x200) {
                sampleSize = dv.getUint32(p);
                p += 4;
              }
              if (flags & 0x400) p += 4;
              if (flags & 0x800) {
                cto = version === 1 ? dv.getInt32(p) : dv.getUint32(p);
                p += 4;
              }
              const pts = (dts + cto) / timescale + offset;
              // AVCC: NAL units with 4-byte lengths; type 6 is SEI.
              for (let q = sample; q + 4 <= sample + sampleSize && q + 4 <= bytes.length; ) {
                const length = dv.getUint32(q);
                if ((bytes[q + 4] & 0x1f) === 6) frames.push([pts, q + 4, Math.min(q + 4 + length, bytes.length)]);
                q += 4 + length;
              }
              sample += sampleSize;
              dts += sampleDuration;
            }
          }
        }
      }
      // Frames arrive in decode order; captions belong to presentation order.
      frames.sort((a, b) => a[0] - b[0]);
      const pairs: number[][] = [];
      for (const [pts, start, end] of frames) readSei(bytes, start, end, pts, pairs);
      return pairs;
    },
  };
}

export type CaptionExtractor = ReturnType<typeof createCaptionExtractor>;
