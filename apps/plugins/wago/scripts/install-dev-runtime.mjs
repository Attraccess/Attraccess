// Explicitly install server-owned assets; pnpm serve never builds them.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const files = ['release.json', 'wago-cc100-runtime.tar', 'wago-cc100-runtime.tar.sha256'];

export function resolveRuntimeDir(workspaceRoot, env = process.env) {
  return resolve(
    workspaceRoot,
    env.WAGO_CC100_BUILD_ASSETS_PATH?.trim() || join(env.STORAGE_ROOT ?? 'storage', 'cc100-runtime'),
  );
}

export async function installDevRuntime(source, target) {
  await mkdir(dirname(target), { recursive: true });
  const staging = await mkdtemp(join(dirname(target), '.cc100-runtime-dev-'));
  const stagedAssets = join(staging, 'assets');
  const backup = join(staging, 'previous');
  let installed = false;
  try {
    await mkdir(stagedAssets);
    const copies = await Promise.allSettled(
      files.map((file) => copyFile(join(source, file), join(stagedAssets, file))),
    );
    const failedCopy = copies.find((result) => result.status === 'rejected');
    if (failedCopy) throw failedCopy.reason;
    const release = JSON.parse(await readFile(join(stagedAssets, 'release.json'), 'utf8'));
    const bundlePath = join(stagedAssets, 'wago-cc100-runtime.tar');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(bundlePath)) hash.update(chunk);
    const digest = hash.digest('hex');
    const checksum = await readFile(join(stagedAssets, 'wago-cc100-runtime.tar.sha256'), 'utf8');
    if (
      release.schemaVersion !== 1 ||
      !/^[a-f0-9]{40}$/.test(release.buildId) ||
      !/^sha256:[a-f0-9]{64}$/.test(release.imageId) ||
      release.bundleSha256 !== digest ||
      release.bundleBytes !== (await stat(bundlePath)).size ||
      checksum.trim().split(/\s+/)[0] !== digest
    )
      throw new Error('Invalid build-owned CC100 runtime assets. Run plugin-wago:build-runtime first.');

    if (existsSync(target)) await rename(target, backup);
    try {
      await rename(stagedAssets, target);
      installed = true;
    } catch (error) {
      if (existsSync(backup)) await rename(backup, target);
      throw error;
    }
  } finally {
    // Preserve the previous release if restoring it also failed.
    if (installed || !existsSync(backup)) await rm(staging, { recursive: true, force: true });
  }
  return target;
}

async function main() {
  const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url));
  const envFile = join(workspaceRoot, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const target = await installDevRuntime(
    join(workspaceRoot, 'apps/plugins/wago/runtime-assets/cc100-build'),
    resolveRuntimeDir(workspaceRoot),
  );
  process.stdout.write(
    `Installed bundled CC100 runtime in ${target}. Restart a running API with pnpm serve to load the new release.\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
