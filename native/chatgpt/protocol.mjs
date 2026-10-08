import { endianness } from 'node:os';

const littleEndian = endianness() === 'LE';
export function encodeMessage(message) {
  const body = Buffer.from(JSON.stringify(message));
  if (body.length > 1024 * 1024) throw new Error('Native response exceeds 1 MiB.');
  const header = Buffer.alloc(4);
  littleEndian ? header.writeUInt32LE(body.length) : header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}

export function messageDecoder(onMessage) {
  let pending = Buffer.alloc(0);
  return (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 4) {
      const length = littleEndian ? pending.readUInt32LE(0) : pending.readUInt32BE(0);
      if (!length || length > 64 * 1024 * 1024) throw new Error('Invalid native message length.');
      if (pending.length < length + 4) break;
      const body = pending.subarray(4, length + 4);
      pending = pending.subarray(length + 4);
      onMessage(JSON.parse(body.toString('utf8')));
    }
  };
}
