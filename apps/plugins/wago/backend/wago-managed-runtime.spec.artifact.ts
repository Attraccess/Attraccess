import { BuildRuntimeArtifact } from './wago-build-runtime';
export const artifact: BuildRuntimeArtifact = {
  imageId: `sha256:${'1'.repeat(64)}`,
  image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'2'.repeat(64)}`,
  buildId: '3'.repeat(40),
  digest: '4'.repeat(64),
  bytes: 81920,
  manifest: {
    schemaVersion: 1,
    runtime: 'attraccess-wago-cc100',
    runtimeVersion: '0.1.0',
    protocolVersion: '1.0.0',
    image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'2'.repeat(64)}`,
    hardware: {
      model: '751-9301',
      platform: 'linux/arm/v7',
      firmwareBaseline: '31',
      profile: 'cc100-751-9301-fw31-digital-v1',
    },
  },
};
