import { BuildRuntimeArtifact } from './wago-build-runtime';

export function release(id: string): BuildRuntimeArtifact {
  return {
    buildId: id.repeat(40),
    imageId: `sha256:${id.repeat(64)}`,
    digest: id.repeat(64),
    bytes: 8192,
    image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${id.repeat(64)}`,
    manifest: {
      schemaVersion: 1,
      runtime: 'attraccess-wago-cc100',
      runtimeVersion: '0.1.0',
      protocolVersion: '1.0.0',
      image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${id.repeat(64)}`,
      hardware: {
        model: '751-9301',
        platform: 'linux/arm/v7',
        firmwareBaseline: '31',
        profile: 'cc100-751-9301-fw31-digital-v1',
      },
    },
  };
}
