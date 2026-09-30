import * as zlib from 'zlib';

// ponytail: hand-rolled solid-circle PNG so the tray has a visible status dot
// with no asset files or build-pipeline changes. crc32 + a single solid IDAT.
// Returns raw PNG bytes; the caller wraps them with nativeImage.createFromBuffer.

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}

export function dotIconPng([r, g, b]: [number, number, number], size = 22): Buffer {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const c = (size - 1) / 2;
  const rad = size / 2 - 1;
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // row filter: none
    for (let x = 0; x < size; x++) {
      const inside = (x - c) ** 2 + (y - c) ** 2 <= rad * rad;
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = inside ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
