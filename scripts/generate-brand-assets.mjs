#!/usr/bin/env node
// Run: node scripts/generate-brand-assets.mjs [--check]
// The shipped high-resolution portrait and original API wordmark are canonical.
// Only static image assets are generated; the React wordmark remains hand-maintained.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');
assert(
  process.argv.slice(2).every((arg) => arg === '--check'),
  'Usage: node scripts/generate-brand-assets.mjs [--check]',
);
const teal = '#256D7B'; // Screen approximation of RAL 5021, not a print color conversion.
const tealRgb = [37, 109, 123];
const pngOptions = { compressionLevel: 9, adaptiveFiltering: false, palette: false };
const assets = new Map();
const read = (path) => readFile(resolve(root, path));

const source = (await read('scripts/brand/lockup-original.svg')).toString().replace(/<!--.*?-->\s*/s, '');
const original = await read('scripts/brand/keyhole-original.png');
assert.equal((source.match(/href="keyhole-original.png"/g) ?? []).length, 1, 'Expected the original raster reference');
const wordmark = source.match(/<path d="([^"]+)" fill="currentcolor">\s*<\/path>/);
assert(wordmark, 'Expected the original vector wordmark');
const ui = (await read('libs/ui/src/AttraccessLogo.tsx')).toString();
assert(ui.includes(`d="${wordmark[1]}" fill="currentColor"`), 'React wordmark must match the canonical lockup');
assert(ui.includes('href="/logo.png"'), 'React logo must use the generated portrait');

function embed(raster) {
  return source.replace('href="keyhole-original.png"', `href="data:image/png;base64,${raster.toString('base64')}"`);
}

function render(image, width, height) {
  return sharp(Buffer.from(image)).resize(width, height, { fit: 'fill' }).png(pngOptions).toBuffer();
}

const { data, info } = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const colored = Buffer.from(data);
const ink = Buffer.from(data);
const whiteShape = Buffer.from(data);
const rose = [197, 121, 130];
let recolored = 0;
for (let i = 0; i < data.length; i += 4) {
  const [r, g, b] = data.subarray(i, i + 3);
  const redChroma = r - g;
  const roseHue = (b - g) / redChroma;
  // The original rose is hue ~353 degrees. Fur (~342 degrees), neutral ink, and
  // brown/red coat patches are outside this band. Unmix rose from neutral edge/shadow
  // pixels rather than replacing their full RGB, retaining the original antialiasing.
  const isRose = data[i + 3] > 0 && redChroma / r > 0.25 && roseHue >= 0.035 && roseHue <= 0.235;
  const coverage = Math.min(1, redChroma / (rose[0] - rose[1]));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const white = Math.min(1, Math.max(0, (luminance - 16) / 224));
  for (let channel = 0; channel < 3; channel++) {
    if (isRose)
      colored[i + channel] = Math.max(
        0,
        Math.min(255, Math.round(data[i + channel] + coverage * (tealRgb[channel] - rose[channel]))),
      );
    // Keep the hand-drawn tonal details instead of thresholding away eyes and coat patches.
    ink[i + channel] = isRose ? 255 : Math.round(tealRgb[channel] + (255 - tealRgb[channel]) * white);
    whiteShape[i + channel] = 255;
    if (!isRose) assert.equal(colored[i + channel], data[i + channel], 'Non-rose artwork must remain unchanged');
  }
  assert.equal(colored[i + 3], data[i + 3], 'Recoloring must preserve every alpha byte');
  if (isRose) recolored++;
}
assert(
  recolored > info.width * info.height * 0.25,
  'Expected the original rose keyhole, not an already generated image',
);
const portrait = await sharp(colored, { raw: info }).png(pngOptions).toBuffer();
const flat = await sharp(ink, { raw: info }).png(pngOptions).toBuffer();
const silhouette = await sharp(whiteShape, { raw: info }).png(pngOptions).toBuffer();
const logo = await render(portrait, 150, 300);
const lockup = embed(portrait);
const apiLogo = await render(lockup, 400, 120);
assets.set('apps/frontend/public/logo.png', logo);
assets.set('docs/_media/logo.png', logo);
assets.set('apps/api/src/assets/logo.png', apiLogo);
assets.set('apps/api/src/assets/logo.svg', Buffer.from(lockup));
assets.set('apps/companion/src/assets/logo.svg', Buffer.from(lockup));

for (const [input, output, width, height] of [
  [original, logo, 150, 300],
  [embed(original), apiLogo, 400, 120],
]) {
  const originalAlpha = await sharp(await render(input, width, height))
    .extractChannel('alpha')
    .raw()
    .toBuffer();
  const alpha = await sharp(output).extractChannel('alpha').raw().toBuffer();
  assert(originalAlpha.equals(alpha), 'Resized logos must preserve the original transparency');
  assert(alpha.includes(0) && alpha.includes(255), 'Logos must retain transparent and opaque pixels');
}

async function icon(size, { maskable = false, small = false, badge = false } = {}) {
  const height = Math.round(size * (maskable ? 0.68 : small || badge ? 0.75 : 0.8));
  const width = Math.round(height / 2);
  const left = Math.floor((size - width) / 2);
  const top = Math.floor((size - height) / 2);
  const foreground = await render(small || badge ? silhouette : flat, width, height);
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
    create: { width: size, height: size, channels: 4, background: badge ? '#00000000' : teal },
  })
    .composite([{ input: foreground, left, top }])
    .png(pngOptions)
    .toBuffer();
  const pixels = await sharp(output).raw().toBuffer();
  for (let i = 0; i < pixels.length; i += 4) {
    if (badge) {
      // Undo RGB rounding from premultiplied-alpha resizing; badge shape is alpha-only.
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
    } else {
      assert.equal(pixels[i + 3], 255, 'App icons must be opaque; the OS applies its own mask');
    }
  }
  if (!badge) assert.deepEqual([...pixels.subarray(0, 3)], tealRgb, 'App background must be flat RAL 5021 teal');
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

for (const size of [192, 512]) {
  assets.set(`apps/frontend/public/icon-${size}.png`, await icon(size));
  assets.set(`apps/frontend/public/icon-${size}-maskable.png`, await icon(size, { maskable: true }));
}
assets.set('apps/frontend/public/apple-touch-icon.png', await icon(180));
assets.set('apps/frontend/public/badge-72.png', await icon(72, { badge: true }));
assets.set('apps/frontend/Attraccess.icon/Assets/key-hole.png', flat);
const favicon = await ico([16, 32]);
assets.set('apps/frontend/public/favicon.ico', favicon);
assets.set('docs/_media/favicon.ico', favicon);
assets.set('apps/companion/assets/icon.ico', await ico([16, 32, 48, 64, 128, 256]));

const composer = JSON.parse(await read('apps/frontend/Attraccess.icon/icon.json'));
const solid = composer.fill.solid?.replace('srgb:', '').split(',').map(Number);
assert(solid, 'Icon Composer must have a solid sRGB background');
assert.deepEqual(
  solid.slice(0, 3).map((channel) => Math.round(channel * 255)),
  tealRgb,
);
assert.equal(solid[3], 1);
assert.equal(composer.groups[0].shadow.opacity, 0, 'Icon Composer must not add a shadow');
assert.equal(composer.groups[0].translucency.enabled, false, 'Icon Composer must not add translucency');

let stale = 0;
for (const [path, expected] of assets) {
  if (check) {
    const actual = await read(path).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (!actual?.equals(expected)) {
      console.error(`Stale or missing brand asset: ${path}`);
      stale++;
    }
  } else {
    const destination = resolve(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, expected);
    console.log(`Generated ${path}`);
  }
}
if (stale) {
  console.error('Run node scripts/generate-brand-assets.mjs to regenerate.');
  process.exitCode = 1;
} else {
  console.log(
    `${check ? 'Verified' : 'Generated'} ${assets.size} brand assets; wordmark, alpha, flat backgrounds, and maskable safe areas verified.`,
  );
}
