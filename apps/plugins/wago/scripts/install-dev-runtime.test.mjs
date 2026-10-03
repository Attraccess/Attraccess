import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { installDevRuntime, resolveRuntimeDir } from './install-dev-runtime.mjs';

test('runtime destination follows the server configuration', () => {
  assert.equal(resolveRuntimeDir('/workspace', {}), '/workspace/storage/cc100-runtime');
  assert.equal(resolveRuntimeDir('/workspace', { STORAGE_ROOT: 'custom' }), '/workspace/custom/cc100-runtime');
  assert.equal(resolveRuntimeDir('/workspace', { STORAGE_ROOT: '/data' }), '/data/cc100-runtime');
  assert.equal(resolveRuntimeDir('/workspace', { WAGO_CC100_BUILD_ASSETS_PATH: '/assets' }), '/assets');
});

test('installs a complete build, replaces it, and preserves it when a new build fails verification', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cc100-install-test-'));
  const source = join(root, 'build');
  const target = join(root, 'storage/cc100-runtime');
  async function build(value) {
    const bytes = Buffer.from(value);
    const digest = createHash('sha256').update(bytes).digest('hex');
    await writeFile(
      join(source, 'release.json'),
      JSON.stringify({
        schemaVersion: 1,
        buildId: 'a'.repeat(40),
        imageId: `sha256:${'b'.repeat(64)}`,
        bundleBytes: bytes.length,
        bundleSha256: digest,
      }),
    );
    await writeFile(join(source, 'wago-cc100-runtime.tar'), bytes);
    await writeFile(join(source, 'wago-cc100-runtime.tar.sha256'), `${digest}  wago-cc100-runtime.tar\n`);
  }
  try {
    await mkdir(source);
    await build('first');
    assert.equal(await installDevRuntime(source, target), target);
    await build('second');
    await installDevRuntime(source, target);
    assert.equal(await readFile(join(target, 'wago-cc100-runtime.tar'), 'utf8'), 'second');
    await writeFile(join(source, 'wago-cc100-runtime.tar'), 'corrupted');
    await assert.rejects(installDevRuntime(source, target), /Invalid build-owned/);
    assert.equal(await readFile(join(target, 'wago-cc100-runtime.tar'), 'utf8'), 'second');
    assert.deepEqual(await readdir(join(root, 'storage')), ['cc100-runtime']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('runtime build/install targets stay explicit and server Docker builds always build assets', async () => {
  const workspaceRoot = new URL('../../../../', import.meta.url);
  const read = (path) => readFile(new URL(path, workspaceRoot), 'utf8');
  const { targets } = JSON.parse(await read('apps/plugins/wago/project.json'));
  assert.deepEqual(targets['install-runtime-dev'].dependsOn, ['build-runtime']);
  assert.equal(targets['build-runtime'].cache, false);
  assert.equal(targets['install-runtime-dev'].cache, false);
  assert.ok(!targets['install-dev'].dependsOn.includes('build-runtime'));
  assert.ok(!targets.build.dependsOn.includes('build-runtime'));
  const dockerAction = await read('.github/actions/docker-build-push/action.yml');
  assert.match(dockerAction, /steps:\s+#[^\n]*\n\s+- uses: \.\/\.github\/actions\/build-cc100-runtime\s+- name:/);
  const dockerfile = await read('Dockerfile');
  assert.match(dockerfile, /COPY --from=builder[^\n]*cc100-build \/app\/share\/cc100-runtime/);
  assert.match(dockerfile, /ENV WAGO_CC100_BUILD_ASSETS_PATH=\/app\/share\/cc100-runtime/);
  assert.match(dockerfile, /throw new Error\('Invalid build-owned CC100 assets'\)/);
});
