import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { hashAssets, main, validateAttractap, validateCompanion } from './validate-api-assets.mjs';

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-assets-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const host = [
  process.platform,
  process.platform === 'darwin' ? 'universal' : process.platform === 'win32' ? 'x64' : process.arch,
];
function companion(platforms = [host]) {
  const entries = platforms.map(([platform, arch]) => {
    const filename = `${platform}-${arch}.bin`;
    const content = Buffer.from('installer');
    fs.writeFileSync(path.join(root, filename), content);
    return {
      platform,
      arch,
      filename,
      size: content.length,
      sha256: createHash('sha256').update(content).digest('hex'),
    };
  });
  fs.writeFileSync(path.join(root, 'companions.json'), JSON.stringify({ platforms: entries }));
  return entries;
}

function firmware() {
  const entry = { filename: 'touch.bin', filenameOTA: 'touch-ota.bin', elfFilename: 'touch.elf' };
  for (const file of Object.values(entry)) fs.writeFileSync(path.join(root, file), 'firmware');
  fs.writeFileSync(path.join(root, 'firmwares.json'), JSON.stringify({ firmwares: [entry] }));
}

test('local Companion assets accept one host while CI requires every installer', () => {
  companion();
  validateCompanion(root);
  assert.throws(() => validateCompanion(root, true), /Missing Companion/);
  companion([
    ['linux', 'x64'],
    ['linux', 'arm64'],
    ['darwin', 'universal'],
    ['win32', 'x64'],
  ]);
  validateCompanion(root, true);
  companion([process.platform === 'linux' ? ['win32', 'x64'] : ['linux', 'x64']]);
  assert.throws(() => validateCompanion(root), /Missing Companion/);
});

test('Companion validation rejects missing, empty and corrupted installers', () => {
  const [entry] = companion();
  for (const content of ['', 'tampered installer']) {
    fs.writeFileSync(path.join(root, entry.filename), content);
    assert.throws(() => validateCompanion(root));
  }
  fs.unlinkSync(path.join(root, entry.filename));
  assert.throws(() => validateCompanion(root));
});

test('firmware validation requires flash and OTA images and declared symbols', () => {
  firmware();
  validateAttractap(root);
  for (const filename of ['touch.bin', 'touch-ota.bin', 'touch.elf']) {
    fs.writeFileSync(path.join(root, filename), '');
    assert.throws(() => validateAttractap(root), /empty/);
    fs.unlinkSync(path.join(root, filename));
    assert.throws(() => validateAttractap(root));
    fs.writeFileSync(path.join(root, filename), 'firmware');
  }
});

test('missing, malformed and empty manifests fail validation', () => {
  for (const [filename, validate] of [
    ['firmwares.json', validateAttractap],
    ['companions.json', validateCompanion],
  ]) {
    assert.throws(() => validate(root));
    for (const content of ['{', '{}', '{"firmwares": [], "platforms": []}']) {
      fs.writeFileSync(path.join(root, filename), content);
      assert.throws(() => validate(root));
    }
  }
});

test('image validation CLI exits nonzero when either required deliverable is missing', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/validate-api-assets.mjs', `--assets-dir=${root}`, '--companion=all', '--attractap'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Asset validation failed/);
});

test('API cache fingerprints notice changes to ignored asset files and deletions', () => {
  const directory = path.join(root, 'attractap-firmwares');
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'touch.bin'), 'first');
  const original = hashAssets(root);
  assert.equal(hashAssets(root), original);
  fs.writeFileSync(path.join(directory, 'touch.bin'), 'other');
  assert.notEqual(hashAssets(root), original);
  fs.unlinkSync(path.join(directory, 'touch.bin'));
  assert.notEqual(hashAssets(root), original);
});

test('image verification rejects bundled files that differ from the supplied artifacts', () => {
  const source = path.join(root, 'source');
  const bundled = path.join(root, 'bundled');
  for (const directory of [source, bundled]) {
    fs.mkdirSync(path.join(directory, 'attractap-firmwares'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'attractap-firmwares', 'touch.bin'), 'firmware');
  }
  main([`--assets-dir=${bundled}`, `--compare-to=${source}`]);
  fs.writeFileSync(path.join(bundled, 'attractap-firmwares', 'touch.bin'), 'mismatch');
  assert.throws(() => main([`--assets-dir=${bundled}`, `--compare-to=${source}`]), /differ/);
});
