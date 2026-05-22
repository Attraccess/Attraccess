// Convert tscircuit SVG exports into PNG renders for PR previews
// FEATURE: hardware/render — shared SVG → PNG step for every board's render target

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { argv, exit } from 'node:process';
import sharp from 'sharp';

const DEFAULT_DENSITY = 200;

function parseArgs(args) {
  const opts = { inputs: [], outDir: null, density: DEFAULT_DENSITY };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--out-dir') {
      opts.outDir = args[i + 1];
      i += 1;
    } else if (arg === '--density') {
      opts.density = Number.parseInt(args[i + 1], 10);
      i += 1;
    } else {
      opts.inputs.push(arg);
    }
  }
  if (opts.inputs.length === 0 || !opts.outDir) {
    throw new Error('usage: render-png.mjs --out-dir <dir> [--density <n>] <svg> [<svg> ...]');
  }
  return opts;
}

async function convertOne(svgPath, outDir, density) {
  const absSvg = resolve(svgPath);
  const svg = await readFile(absSvg);
  const pngName = basename(absSvg).replace(/\.svg$/i, '.png');
  const absOut = resolve(outDir, pngName);
  await mkdir(dirname(absOut), { recursive: true });
  await sharp(svg, { density }).png().toFile(absOut);
  return absOut;
}

async function main() {
  const { inputs, outDir, density } = parseArgs(argv.slice(2));
  for (const svg of inputs) {
    const out = await convertOne(svg, outDir, density);
    process.stdout.write(`${out}\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  exit(1);
});
