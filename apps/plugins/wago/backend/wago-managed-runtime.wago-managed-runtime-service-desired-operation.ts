import { createHash } from 'node:crypto';
import { managedHostHelper } from './wago-managed-helper';
import type { BuildRuntimeArtifact } from './wago-build-runtime';
import { RuntimeUpdateError } from './wago-runtime-update';
import { WagoManagedRuntimeServiceRetryRuntimeOperation } from './wago-managed-runtime.wago-managed-runtime-service-retry-runtime-operation';


export abstract class WagoManagedRuntimeServiceDesiredOperation extends WagoManagedRuntimeServiceRetryRuntimeOperation {
  protected async desired(): Promise<BuildRuntimeArtifact> {
    const value = await this.artifacts.current();
    if (
      !value ||
      !('imageId' in value) ||
      !('buildId' in value) ||
      typeof value.imageId !== 'string' ||
      typeof value.buildId !== 'string'
    )
      throw new RuntimeUpdateError('runtime_assets');
    return {
      ...value,
      installerSha256: createHash('sha256')
        .update(managedHostHelper(value as BuildRuntimeArtifact))
        .digest('hex'),
    } as BuildRuntimeArtifact;
  }
}
