import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { validatePackageContract, verifyPackedPlugin } from './verify-packed-plugin.mjs';

const fixture = () => ({
  name: '@example/plugin',
  version: '1.0.0',
  keywords: ['attraccess-plugin'],
  repository: 'https://example.test/repo',
  homepage: 'https://example.test',
  license: 'MIT',
  attraccess: {
    displayName: 'Example',
    host: '^1.0.0',
    permissions: [],
    sdk: { frontend: '^1.0.0', backend: '^1.0.0' },
    frontend: 'frontend/index.js',
    backend: 'dist/index.js',
  },
  peerDependencies: { '@attraccess/plugins-frontend-sdk': '^1.0.0', '@attraccess/plugins-backend-sdk': '^1.0.0' },
});
test('requires package identity, discoverability, and complete host metadata', () => {
  assert.doesNotThrow(() => validatePackageContract(fixture(), '1.2.0'));
  for (const field of ['name', 'version', 'keywords', 'repository', 'homepage', 'license', 'attraccess']) {
    const pkg = fixture();
    delete pkg[field];
    assert.throws(() => validatePackageContract(pkg, '1.2.0'), /Packed plugin/);
  }
  for (const field of ['displayName', 'host', 'permissions', 'sdk']) {
    const pkg = fixture();
    delete pkg.attraccess[field];
    assert.throws(() => validatePackageContract(pkg, '1.2.0'), /required Attraccess metadata/);
  }
  assert.throws(() => validatePackageContract({ ...fixture(), version: 'latest' }, '1.2.0'), /strict semver/);
});
test('rejects incompatible host or SDK contracts for every declared entry', () => {
  for (const range of ['invalid', '^2.0.0']) {
    const pkg = fixture();
    pkg.attraccess.host = range;
    assert.throws(() => validatePackageContract(pkg, '1.2.0'), /not compatible/);
  }
  for (const entry of ['frontend', 'backend']) {
    for (const range of [undefined, 'invalid', '^2.0.0']) {
      const pkg = fixture();
      pkg.peerDependencies[`@attraccess/plugins-${entry}-sdk`] = range;
      assert.throws(() => validatePackageContract(pkg, '1.2.0'), /compatible peer dependency/);
    }
    const pkg = fixture();
    delete pkg.attraccess.sdk[entry];
    assert.throws(() => validatePackageContract(pkg, '1.2.0'), /compatible peer dependency/);
  }
});
test('does not require backend SDK metadata for a frontend-only package', () => {
  const pkg = fixture();
  delete pkg.attraccess.backend;
  delete pkg.attraccess.sdk.backend;
  delete pkg.peerDependencies['@attraccess/plugins-backend-sdk'];
  assert.doesNotThrow(() => validatePackageContract(pkg, '1.2.0'));
});
test('verifies actual packed entries and removes archives after success or failure', async () => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'attraccess-packed-plugin-'));
  const packageDir = path.join(workspace, 'plugin');
  try {
    for (const directory of [
      'plugin/frontend',
      'dist/libs/plugins-backend-sdk',
      'dist/libs/database-entities',
      'dist/libs/shared',
      'node_modules',
    ])
      mkdirSync(path.join(workspace, directory), { recursive: true });
    writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({ version: '1.2.0' }));
    writeFileSync(path.join(workspace, 'dist/libs/plugins-backend-sdk/index.js'), 'module.exports = {};');
    const pkg = fixture();
    delete pkg.attraccess.backend;
    writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(pkg));
    writeFileSync(path.join(packageDir, 'frontend/index.js'), 'export default {};');
    await verifyPackedPlugin(packageDir, ['package.json', 'frontend/index.js'], workspace);
    assert.equal(
      readdirSync(packageDir).some((file) => file.endsWith('.tgz')),
      false,
    );
    await assert.rejects(verifyPackedPlugin(packageDir, ['missing.js'], workspace), /missing missing.js/);
    assert.equal(
      readdirSync(packageDir).some((file) => file.endsWith('.tgz')),
      false,
    );
    assert.ok(existsSync(path.join(packageDir, 'frontend/index.js')));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
