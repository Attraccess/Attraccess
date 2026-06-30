import * as zlib from 'zlib';
import { dotIconPng } from './tray-icon';

// decode IDAT back to raw RGBA scanlines for assertions
function decode(png: Buffer, size: number) {
  let off = 8;
  let raw: Buffer | undefined;
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') raw = zlib.inflateSync(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  if (!raw) throw new Error('no IDAT');
  const data = raw;
  const stride = size * 4 + 1;
  return (x: number, y: number): [number, number, number, number] => {
    const base = y * stride + 1 + x * 4;
    return [data[base], data[base + 1], data[base + 2], data[base + 3]];
  };
}

describe('dotIconPng', () => {
  it('emits a valid PNG signature and header dimensions', () => {
    const png = dotIconPng([34, 197, 94]);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(22); // width
    expect(png.readUInt32BE(20)).toBe(22); // height
  });

  it('fills the centre with the requested colour, fully opaque', () => {
    const px = decode(dotIconPng([34, 197, 94]), 22);
    expect(px(11, 11)).toEqual([34, 197, 94, 255]);
  });

  it('leaves corners transparent so the dot is a circle', () => {
    const px = decode(dotIconPng([239, 68, 68]), 22);
    expect(px(0, 0)[3]).toBe(0);
  });
});
