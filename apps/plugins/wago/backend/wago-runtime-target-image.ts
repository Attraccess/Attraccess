import { BuildRuntimeArtifact } from './wago-build-runtime';

export function runtimeTargetImageId(
  desired: BuildRuntimeArtifact,
  installed: { imageId: string; runtimeVersion?: string },
): string {
  return installed.imageId && installed.runtimeVersion === desired.manifest.runtimeVersion
    ? installed.imageId
    : desired.imageId;
}
