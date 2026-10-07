import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { smallFile } from './wago-runtime-artifacts.helpers';
import { storedMetadata } from './wago-runtime-artifacts.helpers';
import { WagoRuntimeArtifactCatalogBackfillMetadataOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-backfill-metadata-operation';


export abstract class WagoRuntimeArtifactCatalogMetadataOperation extends WagoRuntimeArtifactCatalogBackfillMetadataOperation {
  protected async metadata(root: string, digest: string) {
    const directory = join(root, 'objects', digest);
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid catalog object');
    try {
      const metadata = storedMetadata(
        JSON.parse(await smallFile(join(directory, 'metadata.json'), 4096)),
        this.maxBytes,
      );
      if (metadata.digest !== digest) throw new Error('Invalid catalog digest');
      return metadata;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // Catalogs written before metadata.json are verified before becoming readable again.
      const metadata = await this.verifiedMetadata(root, digest);
      await this.backfillMetadata(directory, metadata);
      return metadata;
    }
  }
}
