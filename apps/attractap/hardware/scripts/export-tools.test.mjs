import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { parseArgs as pngArgs } from './render-png.mjs';
import { parseArgs as glbArgs } from './render-glb-png.mjs';

const scripts = path.resolve('apps/attractap/hardware/scripts');
function withArchive(csv, run) {
  const directory = mkdtempSync(path.join(tmpdir(), 'attraccess-export-'));
  try {
    writeFileSync(path.join(directory, 'bom.csv'), csv);
    writeFileSync(path.join(directory, 'pick_and_place.csv'), 'Designator,X,Y\nR1,1,2\nANT1,3,4\n');
    const archive = path.join(directory, 'gerbers.zip');
    execFileSync('zip', ['-q', archive, 'bom.csv', 'pick_and_place.csv'], { cwd: directory });
    run(archive);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
function validate(archive) {
  return spawnSync(process.execPath, [path.join(scripts, 'validate-bom.mjs'), archive], { encoding: 'utf8' });
}

test('validates known component classes while allowing explicit hand-populated antennas', () => {
  withArchive('Designator,JLCPCB Part #\nR1,C22775\nQ1,C20917\nANT1,\nCUSTOM1,C22775\n', (archive) => {
    const result = validate(archive);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /BOM OK: 4 designators/);
  });
});
test('rejects missing parts, unknown classification entries, and incorrect component classes', () => {
  for (const [csv, expected] of [
    ['Designator,JLCPCB Part #\nR1,\n', /missing JLCPCB Part #/],
    ['Designator,JLCPCB Part #\nR1,UNKNOWN\nR2,C20917\n', /missing from lcsc-classes.json/],
    ['Designator,JLCPCB Part #\nR1,C20917\n', /component-class mismatch/],
  ])
    withArchive(csv, (archive) => {
      const result = validate(archive);
      assert.equal(result.status, 1);
      assert.match(result.stderr, expected);
    });
});
test('strips only DNP rows from both BOM and pick-and-place files', () => {
  withArchive('Designator,JLCPCB Part #\r\nR1,C22775\r\nANT1,\r\n', (archive) => {
    const output = execFileSync(process.execPath, [path.join(scripts, 'strip-dnp.mjs'), archive], { encoding: 'utf8' });
    assert.match(output, /bom.csv=1 pick_and_place.csv=1/);
    assert.equal(
      execFileSync('unzip', ['-p', archive, 'bom.csv'], { encoding: 'utf8' }),
      'Designator,JLCPCB Part #\nR1,C22775\n',
    );
    assert.equal(
      execFileSync('unzip', ['-p', archive, 'pick_and_place.csv'], { encoding: 'utf8' }),
      'Designator,X,Y\nR1,1,2\n',
    );
  });
});
test('parses rendering dimensions, output paths, and multiple inputs', () => {
  assert.deepEqual(pngArgs(['--density', '144', '--out-dir', 'output', 'a.svg', 'b.svg']), {
    density: 144,
    outDir: 'output',
    inputs: ['a.svg', 'b.svg'],
  });
  assert.equal(pngArgs(['--out-dir', 'output', 'a.svg']).density, 200);
  assert.deepEqual(
    glbArgs([
      '--width',
      '500',
      '--height',
      '400',
      '--camera-orbit',
      '0deg 90deg auto',
      '--out-dir',
      'output',
      'a.glb',
      'b.glb',
    ]),
    { width: 500, height: 400, cameraOrbit: '0deg 90deg auto', outDir: 'output', inputs: ['a.glb', 'b.glb'] },
  );
  assert.equal(glbArgs(['--out-dir', 'output', 'a.glb']).width, 1200);
  for (const parser of [pngArgs, glbArgs]) {
    assert.throws(() => parser([]), /usage/);
    assert.throws(() => parser(['input']), /usage/);
  }
});
test('renders a supplied SVG into the requested PNG directory', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'attraccess-render-'));
  try {
    const input = path.join(directory, 'board.svg');
    writeFileSync(
      input,
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="8"><rect width="12" height="8" fill="#256D7B"/></svg>',
    );
    execFileSync(process.execPath, [
      path.join(scripts, 'render-png.mjs'),
      '--out-dir',
      path.join(directory, 'rendered'),
      '--density',
      '72',
      input,
    ]);
    const metadata = await sharp(path.join(directory, 'rendered/board.png')).metadata();
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.width, 12);
    assert.equal(metadata.height, 8);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
