import { RuntimeArtifactMetadata } from './wago-runtime-artifacts.contracts';
import { RuntimeArtifactUpload } from './wago-runtime-artifacts.contracts';
import { WagoRuntimeArtifactCatalogVerifiedMetadataOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-verified-metadata-operation';


export abstract class WagoRuntimeArtifactCatalogImportOperation extends WagoRuntimeArtifactCatalogVerifiedMetadataOperation {
  async import(upload: RuntimeArtifactUpload): Promise<RuntimeArtifactMetadata> {
    return this.ingest(upload, true);
  }
}
