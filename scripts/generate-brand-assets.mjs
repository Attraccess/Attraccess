#!/usr/bin/env node
// Run: node scripts/generate-brand-assets.mjs [--check]
// The shipped high-resolution portrait and original API wordmark are canonical.
// Only static image assets are generated; the React wordmark remains hand-maintained.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';
import { assetMatches } from './brand-asset-comparison.mjs';
import { createIconRenderer } from './brand-icon-rendering.mjs';

const root = resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');
assert(
  process.argv.slice(2).every((arg) => arg === '--check'),
  'Usage: node scripts/generate-brand-assets.mjs [--check]',
);
const teal = '#256D7B'; // Screen approximation of RAL 5021, not a print color conversion.
const tealRgb = [37, 109, 123];
const whiteRgb = [255, 255, 255];
const pngOptions = { compressionLevel: 9, adaptiveFiltering: false, palette: false };
const assets = new Map();
const read = (path) => readFile(resolve(root, path));

const source = (await read('scripts/brand/lockup-original.svg')).toString();
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
  for (let channel = 0; channel < 3; channel++) {
    if (isRose)
      colored[i + channel] = Math.max(
        0,
        Math.min(255, Math.round(data[i + channel] + coverage * (tealRgb[channel] - rose[channel]))),
      );
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
const silhouette = await sharp(whiteShape, { raw: info }).png(pngOptions).toBuffer();
const logo = await render(portrait, 150, 300);
const lockup = embed(portrait);
const apiLogo = await render(lockup, 400, 120);
assets.set('apps/frontend/public/logo.png', logo);
assets.set('docs/_media/logo.png', logo);
assets.set('apps/api/src/assets/logo.png', apiLogo);
assets.set('apps/api/src/assets/logo.svg', Buffer.from(lockup));
assets.set('apps/companion/src/assets/logo.svg', Buffer.from(lockup));

// LVGL 9 RGB565A8: little-endian RGB565 plane followed by an A8 plane.
// ESP-IDF embeds these binary assets; no generated C++ arrays are committed.
// The reader uses a fixed dark theme. Change only the vector lettering, keeping
// the approved full-color mascot and its embedded raster identical.
const firmwareLockup = lockup.replace(wordmark[0], wordmark[0].replace('fill="currentcolor"', 'fill="#F4F8F8"'));
assert.notEqual(firmwareLockup, lockup, 'Firmware wordmark must use light ink');
for (const [width, height] of [
  [133, 40],
  [400, 120],
]) {
  const rgba = await sharp(await render(firmwareLockup, width, height))
    .ensureAlpha()
    .raw()
    .toBuffer();
  const pixelCount = width * height;
  const image = Buffer.alloc(pixelCount * 3);
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const offset = pixel * 4;
    const rgb565 = ((rgba[offset] >> 3) << 11) | ((rgba[offset + 1] >> 2) << 5) | (rgba[offset + 2] >> 3);
    image.writeUInt16LE(rgb565, pixel * 2);
    image[pixelCount * 2 + pixel] = rgba[offset + 3];
    const decoded = image.readUInt16LE(pixel * 2);
    assert(Math.abs(((decoded >> 11) << 3) - rgba[offset]) <= 7);
    assert(Math.abs((((decoded >> 5) & 63) << 2) - rgba[offset + 1]) <= 3);
    assert(Math.abs(((decoded & 31) << 3) - rgba[offset + 2]) <= 7);
    assert.equal(image[pixelCount * 2 + pixel], rgba[offset + 3]);
  }
  assets.set(`apps/attractap/firmware/src/display/images/logo_${width}x${height}.rgb565a8`, image);
}

// Bottom-left square keeps the raccoon reaching toward the rings together.
// Keep a PNG preview alongside the source; LVGL consumes the opaque RGB565 bytes.
const wallpaper = await read('apps/frontend/public/login-wallpaper-RAL5020.png');
const wallpaperMetadata = await sharp(wallpaper).metadata();
const cropSize = Math.min(wallpaperMetadata.width, wallpaperMetadata.height);
const squareWallpaper = await sharp(wallpaper)
  .extract({ left: 0, top: wallpaperMetadata.height - cropSize, width: cropSize, height: cropSize })
  .resize(480, 480)
  .png(pngOptions)
  .toBuffer();
assets.set('apps/frontend/public/login-wallpaper-RAL5020-480.png', squareWallpaper);
const wallpaperRgb = await sharp(squareWallpaper).removeAlpha().raw().toBuffer();
const wallpaper565 = Buffer.alloc(480 * 480 * 2);
for (let pixel = 0; pixel < 480 * 480; pixel++) {
  const offset = pixel * 3;
  const value =
    ((wallpaperRgb[offset] >> 3) << 11) | ((wallpaperRgb[offset + 1] >> 2) << 5) | (wallpaperRgb[offset + 2] >> 3);
  wallpaper565.writeUInt16LE(value, pixel * 2);
}
assets.set('apps/attractap/firmware/src/display/images/lockscreen.rgb565', wallpaper565);

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
// ICO directories containing PNG frames work in modern browsers and Windows, without another dependency.
const { icon, ico } = createIconRenderer({ portrait, silhouette, render, pngOptions, teal, tealRgb, whiteRgb });
for (const size of [192, 512]) {
  assets.set(`apps/frontend/public/icon-${size}.png`, await icon(size));
  assets.set(`apps/frontend/public/icon-${size}-maskable.png`, await icon(size, { maskable: true }));
}
assets.set('apps/frontend/public/apple-touch-icon.png', await icon(180));
assets.set('apps/frontend/public/badge-72.png', await icon(72, { badge: true }));
assets.set('apps/frontend/Attraccess.icon/Assets/key-hole.png', portrait);
const favicon = await ico([16, 32]);
assets.set('apps/frontend/public/favicon.ico', favicon);
assets.set('docs/_media/favicon.ico', favicon);
assets.set('apps/companion/assets/icon.ico', await ico([16, 32, 48, 64, 128, 256]));

const composer = JSON.parse(await read('apps/frontend/Attraccess.icon/icon.json'));
const solid = composer.fill.solid?.replace('srgb:', '').split(',').map(Number);
assert(solid, 'Icon Composer must have a solid sRGB background');
assert.deepEqual(
  solid.slice(0, 3).map((channel) => Math.round(channel * 255)),
  whiteRgb,
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
    if (!actual || !(await assetMatches(path, actual, expected))) {
      process.stderr.write(`Stale or missing brand asset: ${path}\n`);
      stale++;
    }
  } else {
    const destination = resolve(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, expected);
    process.stdout.write(`Generated ${path}\n`);
  }
}
if (stale) {
  process.stderr.write('Run node scripts/generate-brand-assets.mjs to regenerate.\n');
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${check ? 'Verified' : 'Generated'} ${assets.size} brand assets; wordmark, alpha, flat backgrounds, and maskable safe areas verified.\n`,
  );
}
