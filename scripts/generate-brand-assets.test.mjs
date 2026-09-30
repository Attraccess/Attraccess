import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('committed brand assets preserve canonical artwork, alpha, and icon safe areas', () => {
  const output = execFileSync(process.execPath, ['scripts/generate-brand-assets.mjs', '--check'], { encoding: 'utf8' });
  assert.match(output, /Verified \d+ brand assets/);
  assert.match(output, /wordmark, alpha, flat backgrounds, and maskable safe areas verified/);
});

test('rejects unsupported arguments before generating assets', () => {
  const result = spawnSync(process.execPath, ['scripts/generate-brand-assets.mjs', '--unknown'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: node scripts\/generate-brand-assets.mjs/);
});
