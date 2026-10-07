import { constants } from 'node:fs';
import { open, rm, chmod } from 'node:fs/promises';
import filesystem from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { RuntimeArtifactMetadata } from './wago-runtime-artifacts.contracts';
import { writeArtifactStream } from './wago-runtime-artifacts.helpers';
import { WagoRuntimeArtifactCatalogVerifyOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-verify-operation';
export abstract class WagoRuntimeArtifactCatalogWriteMetadataOperation extends WagoRuntimeArtifactCatalogVerifyOperation {
  protected async writeMetadata(directory: string, metadata: RuntimeArtifactMetadata) {
    const path = join(directory, 'metadata.json');
    const temporary = join(directory, `.metadata-${randomUUID()}`);
    try {
      await writeArtifactStream(temporary, Readable.from([JSON.stringify(metadata)]), 4096);
      await chmod(temporary, 0o400);
      await filesystem.rename(temporary, path);
      const handle = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
