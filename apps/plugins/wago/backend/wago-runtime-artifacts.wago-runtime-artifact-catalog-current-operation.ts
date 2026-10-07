import { join } from 'node:path';
import { digestPattern } from './wago-runtime-artifacts.state';
import { RuntimeArtifactMetadata } from './wago-runtime-artifacts.contracts';
import { smallFile } from './wago-runtime-artifacts.helpers';
import { WagoRuntimeArtifactCatalogIngestOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-ingest-operation';


export abstract class WagoRuntimeArtifactCatalogCurrentOperation extends WagoRuntimeArtifactCatalogIngestOperation {
  async current(): Promise<RuntimeArtifactMetadata | null> {
    const root = await this.root();
    let digest: string;
    try {
      digest = await smallFile(join(root, 'current'), 64);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    if (!digestPattern.test(digest)) throw new Error('Invalid current runtime artifact');
    return this.metadata(root, digest);
  }
}
