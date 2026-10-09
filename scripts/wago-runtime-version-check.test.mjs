import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { isRuntimeSource } from './check-wago-runtime-version.mjs';

const script = fileURLToPath(new URL('./check-wago-runtime-version.mjs', import.meta.url));
const manifest = 'apps/plugins/wago/cc100-runtime/manifest.json';
const source = 'apps/plugins/wago/cc100-runtime/src/runtime.ts';

test('covers shared contracts, runtime dependencies, image construction and activation, excluding tests/docs/simulators', () => {
  for (const path of [
    source,
    manifest,
    'apps/plugins/wago/modbus/model.ts',
    'apps/plugins/wago/shared/hardware-profile.ts',
    'apps/plugins/wago/project.json',
    'apps/plugins/wago/channel-behavior.ts',
    'apps/plugins/wago/measurement-contract.ts',
    'apps/plugins/wago/cc100-runtime/Dockerfile',
    'apps/plugins/wago/backend/protocol/index.ts',
    'apps/plugins/wago/backend/host/hardware-deployment.ts',
    'apps/plugins/wago/backend/host/host-io-guard.ts',
    'apps/plugins/wago/backend/runtime/supervisor.ts',
    'apps/plugins/wago/backend/runtime/install.ts',
    'apps/plugins/wago/backend/runtime/update/shell.ts',
    'pnpm-lock.yaml',
    '.github/actions/build-cc100-runtime/action.yml',
  ])
    assert.equal(isRuntimeSource(path), true, path);
  for (const path of [
    'apps/plugins/wago/frontend/src/controllers/Table.tsx',
    'apps/plugins/wago/cc100-runtime/src/runtime.spec.ts',
    'apps/plugins/wago/cc100-runtime/HARDWARE.md',
    'apps/plugins/wago/cc100-runtime/integration/run.mjs',
    'apps/plugins/wago/cc100-runtime/src/simulator.ts',
    'apps/plugins/wago/cc100-runtime/src/simulator/device.ts',
    'apps/plugins/wago/cc100-runtime/Dockerfile.simulator',
  ])
    assert.equal(isRuntimeSource(path), false, path);
});

for (const [name, path, next, pass] of [
  ['requires a bump for runtime edits', source, '0.2.0', false],
  ['requires a bump for shared code', 'apps/plugins/wago/modbus/model.ts', '0.2.0', false],
  ['accepts a patch bump', source, '0.2.1', true],
  ['accepts a minor bump', source, '0.3.0', true],
  ['accepts a major bump', source, '1.0.0', true],
  ['compares numeric components', source, '0.10.0', true],
  ['rejects a downgrade', source, '0.1.9', false],
  ['rejects a malformed version', source, 'banana', false],
  ['rejects a prerelease version', source, '0.3.0-dev', false],
  ['rejects a manifest-only downgrade', manifest, '0.1.0', false],
  ['allows docs without a bump', 'apps/plugins/wago/cc100-runtime/README.md', '0.2.0', true],
  ['allows test edits without a bump', 'apps/plugins/wago/cc100-runtime/src/runtime.spec.ts', '0.2.0', true],
  ['allows unrelated edits without a bump', 'apps/frontend/README.md', '0.2.0', true],
]) {
  test(name, () => {
    const directory = mkdtempSync(join(tmpdir(), 'cc100-version-check-'));
    const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
    const file = (path, content) => {
      mkdirSync(join(directory, path, '..'), { recursive: true });
      writeFileSync(join(directory, path), content);
    };
    try {
      git('init', '--quiet');
      git('config', 'user.email', 'test@example.com');
      git('config', 'user.name', 'Test');
      git('config', 'commit.gpgsign', 'false');
      file(manifest, JSON.stringify({ runtimeVersion: '0.2.0' }));
      file(source, 'baseline');
      git('add', '.');
      git('commit', '--quiet', '-m', 'baseline');
      const base = git('rev-parse', 'HEAD');
      file(path, 'changed');
      file(manifest, JSON.stringify({ runtimeVersion: next }));
      git('add', '.');
      git('commit', '--quiet', '--allow-empty', '-m', 'change');
      if (pass)
        assert.match(
          execFileSync(process.execPath, [script, base], { cwd: directory, encoding: 'utf8' }),
          /increased|No WAGO/,
        );
      else assert.throws(() => execFileSync(process.execPath, [script, base], { cwd: directory, stdio: 'pipe' }));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
