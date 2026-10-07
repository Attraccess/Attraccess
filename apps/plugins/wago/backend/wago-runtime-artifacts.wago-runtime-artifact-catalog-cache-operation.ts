import { RuntimeArtifactMetadata } from './wago-runtime-artifacts.contracts';
import { RuntimeArtifactUpload } from './wago-runtime-artifacts.contracts';
import { WagoRuntimeArtifactCatalogImportOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-import-operation';


export abstract class WagoRuntimeArtifactCatalogCacheOperation extends WagoRuntimeArtifactCatalogImportOperation {
  /** Immutable cache insertion must not change another server build's selection. */
  protected async cache(upload: RuntimeArtifactUpload): Promise<RuntimeArtifactMetadata> {
    return this.ingest(upload, false);
  }
}
