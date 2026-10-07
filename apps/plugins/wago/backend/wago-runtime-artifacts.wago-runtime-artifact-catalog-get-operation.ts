import { ConflictException } from '@nestjs/common';
import { digestPattern } from './wago-runtime-artifacts.state';
import { RuntimeArtifactMetadata } from './wago-runtime-artifacts.contracts';
import { WagoRuntimeArtifactCatalogCurrentOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-current-operation';


export abstract class WagoRuntimeArtifactCatalogGetOperation extends WagoRuntimeArtifactCatalogCurrentOperation {
  async get(digest: string): Promise<RuntimeArtifactMetadata> {
    if (!digestPattern.test(digest)) throw new ConflictException('Select a verified runtime release.');
    return this.verifiedMetadata(await this.root(), digest);
  }
}
