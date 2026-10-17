import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { installDevPlugin, resolvePluginDir } from './install-dev-plugin.mjs';

test('resolves the same plugin directory precedence as the API, relative to the workspace', () => {
  assert.equal(resolvePluginDir('/workspace', {}), '/workspace/storage/plugins');
  assert.equal(resolvePluginDir('/workspace', { STORAGE_ROOT: 'custom' }), '/workspace/custom/plugins');
  assert.equal(resolvePluginDir('/workspace', { STORAGE_ROOT: '/custom' }), '/custom/plugins');
  assert.equal(resolvePluginDir('/workspace', { STORAGE_ROOT: '/custom', PLUGIN_DIR: 'local' }), '/workspace/local');
});

test('installs package contents and replaces stale files while preserving other plugins', () => {
  const root = mkdtempSync(join(tmpdir(), 'attraccess-dev-plugin-'));
  const source = join(root, 'built');
  const plugins = join(root, 'storage/plugins');
  const manifest = { name: 'example', main: { backend: { directory: 'dist', entryPoint: 'index.js' } } };
  try {
    mkdirSync(join(source, 'dist'), { recursive: true });
    writeFileSync(join(source, 'plugin.json'), JSON.stringify(manifest));
    writeFileSync(join(source, 'dist/index.js'), 'version one');
    const target = installDevPlugin(source, plugins);
    assert.equal(readFileSync(join(target, 'dist/index.js'), 'utf8'), 'version one');
    mkdirSync(join(plugins, 'other'));
    writeFileSync(join(plugins, 'other/keep'), 'keep');
    writeFileSync(join(target, 'stale.js'), 'stale');
    writeFileSync(join(source, 'dist/index.js'), 'version two');
    assert.equal(installDevPlugin(source, plugins), target);
    assert.equal(readFileSync(join(target, 'dist/index.js'), 'utf8'), 'version two');
    assert.equal(existsSync(join(target, 'stale.js')), false);
    assert.equal(readFileSync(join(plugins, 'other/keep'), 'utf8'), 'keep');
    assert.deepEqual(readdirSync(plugins).sort(), ['example', 'other']);

    rmSync(join(source, 'dist/index.js'));
    assert.throws(() => installDevPlugin(source, plugins), /Missing or invalid built plugin entry/);
    assert.equal(readFileSync(join(target, 'dist/index.js'), 'utf8'), 'version two');
    for (const name of ['../example', '.', 'npm-managed', 'path\\example']) {
      writeFileSync(join(source, 'plugin.json'), JSON.stringify({ ...manifest, name }));
      assert.throws(() => installDevPlugin(source, plugins), /safe, non-npm-managed directory name/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
