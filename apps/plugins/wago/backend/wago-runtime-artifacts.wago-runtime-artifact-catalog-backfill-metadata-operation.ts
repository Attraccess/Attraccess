import { RuntimeArtifactMetadata } from './wago-runtime-artifacts.contracts';
import { WagoRuntimeArtifactCatalogWriteMetadataOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-write-metadata-operation';


export abstract class WagoRuntimeArtifactCatalogBackfillMetadataOperation extends WagoRuntimeArtifactCatalogWriteMetadataOperation {
  protected async backfillMetadata(directory: string, metadata: RuntimeArtifactMetadata) {
    try {
      await this.writeMetadata(directory, metadata);
    } catch (error) {
      // Concurrent readers may verify the same legacy object and race to backfill it.
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
}
