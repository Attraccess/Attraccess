import assert from 'node:assert/strict';
import sharp from 'sharp';

export function createIconRenderer({ portrait, silhouette, render, pngOptions, teal, tealRgb, whiteRgb }) {
  async function icon(size, { maskable = false, small = false, badge = false } = {}) {
    const height = Math.round(size * (maskable ? 0.68 : small || badge ? 0.75 : 0.8));
    const width = Math.round(height / 2);
    const left = Math.floor((size - width) / 2);
    const top = Math.floor((size - height) / 2);
    // Use the same full-color artwork as logo.png. Only tiny favicons and the
    // alpha-only notification badge use a silhouette; never tint the mascot.
    const foreground = await render(small || badge ? silhouette : portrait, width, height);
    if (maskable) {
      const alpha = await sharp(foreground).extractChannel('alpha').raw().toBuffer();
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (alpha[y * width + x] === 0) continue;
          // Every visible foreground pixel, not just its center, fits the 40%-radius safe circle.
          const dx = Math.abs(left + x + 0.5 - size / 2) + 0.5;
          const dy = Math.abs(top + y + 0.5 - size / 2) + 0.5;
          assert(Math.hypot(dx, dy) <= size * 0.4, `${size}px maskable artwork exceeds the safe circle`);
        }
      }
    }
    const output = await sharp({
      create: { width: size, height: size, channels: 4, background: badge ? '#00000000' : small ? teal : '#ffffff' },
    })
      .composite([{ input: foreground, left, top }])
      .png(pngOptions)
      .toBuffer();
    const pixels = await sharp(output).raw().toBuffer();
    let warmCoatPixels = 0;
    let neutralInkPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (badge) {
        // Undo RGB rounding from premultiplied-alpha resizing; badge shape is alpha-only.
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
      } else {
        assert.equal(pixels[i + 3], 255, 'App icons must be opaque; the OS applies its own mask');
        const [r, g, b] = pixels.subarray(i, i + 3);
        if (r > g + 20 && g > b + 5) warmCoatPixels++;
        if (Math.max(r, g, b) < 100 && Math.max(r, g, b) - Math.min(r, g, b) < 20) neutralInkPixels++;
      }
    }
    if (!small && !badge) {
      // A teal tint can preserve every outline and alpha byte while losing the
      // actual artwork. Check the rendered icons still contain brown coat patches
      // and dark neutral ink, including the smallest full-color Windows frame.
      assert(warmCoatPixels > 0, `${size}px icon must retain the mascot's warm coat colors`);
      assert(neutralInkPixels > 0, `${size}px icon must retain the mascot's dark neutral ink`);
    }
    if (!badge)
      assert.deepEqual(
        [...pixels.subarray(0, 3)],
        small ? tealRgb : whiteRgb,
        'Icons must use a white background, or RAL 5021 teal behind the small white silhouette',
      );
    return badge
      ? sharp(pixels, { raw: { width: size, height: size, channels: 4 } })
          .png(pngOptions)
          .toBuffer()
      : output;
  }

  // ICO directories containing PNG frames work in modern browsers and Windows, without another dependency.
  async function ico(sizes) {
    const frames = await Promise.all(sizes.map((size) => icon(size, { small: size <= 32 })));
    const directory = Buffer.alloc(6 + sizes.length * 16);
    directory.writeUInt16LE(1, 2);
    directory.writeUInt16LE(sizes.length, 4);
    let offset = directory.length;
    for (const [index, frame] of frames.entries()) {
      const size = sizes[index];
      const entry = 6 + index * 16;
      directory[entry] = directory[entry + 1] = size === 256 ? 0 : size;
      directory.writeUInt16LE(1, entry + 4);
      directory.writeUInt16LE(32, entry + 6);
      directory.writeUInt32LE(frame.length, entry + 8);
      directory.writeUInt32LE(offset, entry + 12);
      offset += frame.length;
    }
    return Buffer.concat([directory, ...frames]);
  }
  return { icon, ico };
}
