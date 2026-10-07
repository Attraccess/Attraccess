import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { WagoRuntimeArtifactCatalogMetadataOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-metadata-operation';


export abstract class WagoRuntimeArtifactCatalogVerifiedMetadataOperation extends WagoRuntimeArtifactCatalogMetadataOperation {
  protected async verifiedMetadata(root: string, digest: string) {
    const directory = join(root, 'objects', digest);
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid catalog object');
    const metadata = await this.verify(directory);
    if (metadata.digest !== digest) throw new Error('Invalid catalog digest');
    return metadata;
  }
}
