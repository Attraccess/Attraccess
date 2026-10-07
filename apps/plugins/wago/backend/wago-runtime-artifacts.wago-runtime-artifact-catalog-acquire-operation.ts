import { ConflictException } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { VerifiedRuntimeArtifact } from './wago-runtime-artifacts.contracts';
import { digestPattern } from './wago-runtime-artifacts.state';
import { openArtifactFile } from './wago-runtime-artifacts.helpers';
import { writeArtifactStream } from './wago-runtime-artifacts.helpers';
import { WagoRuntimeArtifactCatalogHasOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-has-operation';


export abstract class WagoRuntimeArtifactCatalogAcquireOperation extends WagoRuntimeArtifactCatalogHasOperation {
  /** Copies to an owned snapshot and re-verifies it; later imports never change this delivery. */
  async acquire(digest?: string): Promise<VerifiedRuntimeArtifact> {
    const selected = digest ?? (await this.current())?.digest;
    if (!selected || !digestPattern.test(selected))
      throw new ConflictException('Import a verified runtime release first');
    const root = await this.root();
    await this.verifiedMetadata(root, selected);
    const directory = await this.createTemporaryDirectory(join(root, 'snapshots'), 'delivery');
    const cleanup = () => rm(directory, { recursive: true, force: true });
    try {
      for (const [name, limit] of [
        ['runtime.tar', this.maxBytes],
        ['runtime.tar.sha256', 4096],
      ] as const) {
        const file = await openArtifactFile(join(root, 'objects', selected, name));
        try {
          await writeArtifactStream(join(directory, name), file.createReadStream({ autoClose: false }), limit);
        } finally {
          await file.close();
        }
      }
      const metadata = await this.verify(directory);
      if (metadata.digest !== selected) throw new Error('Artifact changed during snapshot acquisition');
      return Object.freeze({ ...metadata, path: join(directory, 'runtime.tar'), directory, cleanup });
    } catch (error) {
      await cleanup();
      throw error;
    }
  }
}
