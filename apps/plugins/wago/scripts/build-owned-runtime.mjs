#!/usr/bin/env node
// --build compiles the ARMv7 image first. CI can package an already-built image.
// Local dev and CI use the same packaging path; no registry or admin import is needed.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { savedImageIdentity } from './docker-image-identity.mjs';

const buildId = process.env.CC100_BUILD_ID ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(buildId)) throw new Error('CC100_BUILD_ID must be a full commit SHA');
const image = `ghcr.io/attraccess/wago-cc100-runtime:${buildId}`;
if (process.argv.includes('--build')) {
  execFileSync(
    'docker',
    [
      'buildx',
      'build',
      '--platform',
      'linux/arm/v7',
      '--load',
      '-t',
      image,
      '-f',
      'apps/plugins/wago/cc100-runtime/Dockerfile',
      '.',
    ],
    { stdio: 'inherit' },
  );
}
const [info] = JSON.parse(execFileSync('docker', ['image', 'inspect', image], { encoding: 'utf8' }));
if (
  info.Os !== 'linux' ||
  info.Architecture !== 'arm' ||
  info.Variant !== 'v7' ||
  !/^sha256:[a-f0-9]{64}$/.test(info.Id)
) {
  throw new Error('Build-owned CC100 runtime must be a single Linux ARMv7 Docker image');
}
const manifest = JSON.parse(await readFile('apps/plugins/wago/cc100-runtime/manifest.json', 'utf8'));
const stage = await mkdtemp(join(tmpdir(), 'cc100-build-'));
try {
  const archive = join(stage, 'image.tar');
  execFileSync('docker', ['save', image, '-o', archive], { stdio: 'inherit' });
  const imageId = savedImageIdentity(archive, image);
  // The offline reference is pinned by Docker config identity. It is never pulled
  // from a registry; the host verifies docker load against release.json.imageId.
  execFileSync(
    process.execPath,
    [
      'apps/plugins/wago/scripts/package-runtime-artifact.mjs',
      '--image-archive',
      archive,
      '--image',
      `${image}@${imageId}`,
      '--image-id',
      imageId,
      '--build-id',
      buildId,
      '--version',
      manifest.runtimeVersion,
      '--hardware-profile',
      manifest.deployment.hardwareProfile,
      '--out',
      resolve('apps/plugins/wago/runtime-assets'),
    ],
    { stdio: 'inherit' },
  );
} finally {
  await rm(stage, { recursive: true, force: true });
}
