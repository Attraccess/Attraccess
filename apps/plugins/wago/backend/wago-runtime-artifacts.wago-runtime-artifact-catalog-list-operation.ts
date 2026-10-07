import { join } from 'node:path';
import { RuntimeArtifactMetadata } from './wago-runtime-artifacts.contracts';
import { readdir } from 'node:fs/promises';
import { digestPattern } from './wago-runtime-artifacts.state';
import { WagoRuntimeArtifactCatalogGetOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-get-operation';


export abstract class WagoRuntimeArtifactCatalogListOperation extends WagoRuntimeArtifactCatalogGetOperation {
  async list(): Promise<RuntimeArtifactMetadata[]> {
    const root = await this.root();
    const result: RuntimeArtifactMetadata[] = [];
    for (const digest of (await readdir(join(root, 'objects'))).sort()) {
      if (digestPattern.test(digest)) result.push(await this.metadata(root, digest));
    }
    return result;
  }
}
