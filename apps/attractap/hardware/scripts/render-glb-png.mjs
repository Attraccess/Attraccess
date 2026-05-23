// Headless render glTF binary GLB file to PNG via Playwright and model-viewer
// FEATURE: hardware/render — visual 3D PNG for PR previews and Linear comments

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { argv, cwd, exit } from 'node:process';

const requireFromCwd = createRequire(`${cwd()}/`);
const { chromium } = requireFromCwd('playwright');

const MODEL_VIEWER_VERSION = '4.1.0';
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 900;

function parseArgs(args) {
  const opts = {
    inputs: [],
    outDir: null,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    cameraOrbit: '35deg 60deg auto',
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--out-dir') {
      opts.outDir = args[i + 1];
      i += 1;
    } else if (arg === '--width') {
      opts.width = Number.parseInt(args[i + 1], 10);
      i += 1;
    } else if (arg === '--height') {
      opts.height = Number.parseInt(args[i + 1], 10);
      i += 1;
    } else if (arg === '--camera-orbit') {
      opts.cameraOrbit = args[i + 1];
      i += 1;
    } else {
      opts.inputs.push(arg);
    }
  }
  if (opts.inputs.length === 0 || !opts.outDir) {
    throw new Error('usage: render-glb-png.mjs --out-dir <dir> [--width <px>] [--height <px>] [--camera-orbit <orbit>] <glb> [<glb> ...]');
  }
  return opts;
}

function buildHtml({ glbDataUri, width, height, cameraOrbit }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; background: #f4f4f8; }
  model-viewer { width: ${width}px; height: ${height}px; background: #f4f4f8; }
</style>
<script type="module" src="https://cdn.jsdelivr.net/npm/@google/model-viewer@${MODEL_VIEWER_VERSION}/dist/model-viewer.min.js"></script>
</head>
<body>
<model-viewer
  id="mv"
  src="${glbDataUri}"
  camera-controls
  shadow-intensity="0.6"
  exposure="1.0"
  environment-image="neutral"
  camera-orbit="${cameraOrbit}"
  field-of-view="22deg"
  min-field-of-view="22deg"
  max-field-of-view="22deg"
  interaction-prompt="none"
  loading="eager"
></model-viewer>
</body>
</html>`;
}

async function renderOne(browser, glbPath, outDir, width, height, cameraOrbit) {
  const absGlb = resolve(glbPath);
  const bytes = await readFile(absGlb);
  const glbDataUri = `data:model/gltf-binary;base64,${bytes.toString('base64')}`;
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(buildHtml({ glbDataUri, width, height, cameraOrbit }), { waitUntil: 'load' });
  await page.waitForFunction(
    () => {
      const mv = document.getElementById('mv');
      return mv && mv.loaded === true && mv.modelIsVisible === true;
    },
    { timeout: 60_000 },
  );
  await page.waitForTimeout(500);
  const pngName = basename(absGlb).replace(/\.glb$/i, '.png');
  const outPath = join(resolve(outDir), pngName);
  const mv = await page.$('#mv');
  await mv.screenshot({ path: outPath });
  await page.close();
  return outPath;
}

async function main() {
  const { inputs, outDir, width, height, cameraOrbit } = parseArgs(argv.slice(2));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const glb of inputs) {
      const out = await renderOne(browser, glb, outDir, width, height, cameraOrbit);
      process.stdout.write(`${out}\n`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  exit(1);
});
