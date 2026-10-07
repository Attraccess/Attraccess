import { join } from 'node:path';
import { WagoRuntimeArtifactCatalogCreateTemporaryDirectoryOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-create-temporary-directory-operation';


export abstract class WagoRuntimeArtifactCatalogCreateUploadDirectoryOperation extends WagoRuntimeArtifactCatalogCreateTemporaryDirectoryOperation {
  async createUploadDirectory() {
    return this.createTemporaryDirectory(join(await this.root(), 'staging'), 'upload');
  }
}
