import { BuildRuntimeArtifact } from './artifacts/build';

export function runtimeTargetImageId(
  desired: BuildRuntimeArtifact,
  installed: { imageId: string; runtimeVersion?: string },
): string {
  return installed.imageId && installed.runtimeVersion === desired.manifest.runtimeVersion
    ? installed.imageId
    : desired.imageId;
}
