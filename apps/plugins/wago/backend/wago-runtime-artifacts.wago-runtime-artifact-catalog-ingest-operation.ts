import { BadRequestException } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { constants } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { open } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { chmod } from 'node:fs/promises';
import filesystem from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { RuntimeArtifactMetadata } from './wago-runtime-artifacts.contracts';
import { RuntimeArtifactUpload } from './wago-runtime-artifacts.contracts';
import { temporaryName } from './wago-runtime-artifacts.helpers';
import { writeArtifactStream } from './wago-runtime-artifacts.helpers';
import { WagoRuntimeArtifactCatalogCacheOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-cache-operation';


export abstract class WagoRuntimeArtifactCatalogIngestOperation extends WagoRuntimeArtifactCatalogCacheOperation {
  protected async ingest(upload: RuntimeArtifactUpload, publish: boolean): Promise<RuntimeArtifactMetadata> {
    if (this.activeImports >= 2) {
      for (const source of Object.values(upload)) source.destroy();
      throw new ConflictException('Another runtime import is in progress; retry shortly');
    }
    this.activeImports++;
    let directory: string | undefined;
    try {
      directory = await this.createUploadDirectory();
      // Wait for all writers before cleanup, including when one stream fails.
      const results = await Promise.allSettled([
        writeArtifactStream(join(directory, 'runtime.tar'), upload.bundle, this.maxBytes),
        writeArtifactStream(join(directory, 'runtime.tar.sha256'), upload.checksum, 4096),
      ]);
      if (results.some((result) => result.status === 'rejected'))
        throw new Error('Invalid or oversized artifact upload');
      const metadata = await this.verify(directory);
      await this.writeMetadata(directory, metadata);
      const root = await this.root();
      for (const name of ['runtime.tar', 'runtime.tar.sha256', 'metadata.json'])
        await chmod(join(directory, name), 0o400);
      const stageHandle = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        await stageHandle.sync();
      } finally {
        await stageHandle.close();
      }
      const destination = join(root, 'objects', metadata.digest);
      try {
        await filesystem.rename(directory, destination);
      } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        const existing = await lstat(destination);
        if (!existing.isDirectory() || existing.isSymbolicLink()) throw new Error('Invalid catalog object');
        const existingMetadata = await this.verify(destination);
        if (existingMetadata.digest !== metadata.digest) throw new Error('Invalid catalog object');
        await this.backfillMetadata(destination, existingMetadata);
      }
      const objectsHandle = await open(join(root, 'objects'), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        await objectsHandle.sync();
      } finally {
        await objectsHandle.close();
      }
      // Complete immutable objects are published before the atomic current-pointer replacement.
      if (publish) {
        const pointer = join(root, temporaryName('current'));
        try {
          await writeArtifactStream(pointer, Readable.from([metadata.digest]), 64);
          await filesystem.rename(pointer, join(root, 'current'));
          const handle = await open(root, constants.O_RDONLY);
          try {
            await handle.sync();
          } finally {
            await handle.close();
          }
        } finally {
          await rm(pointer, { force: true });
        }
      }
      return metadata;
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new BadRequestException(
        'Runtime import failed. Check the release files, size, and manifest compatibility.',
      );
    } finally {
      for (const source of Object.values(upload)) source.destroy();
      try {
        if (directory) await rm(directory, { recursive: true, force: true });
      } finally {
        this.activeImports--;
      }
    }
  }
}
