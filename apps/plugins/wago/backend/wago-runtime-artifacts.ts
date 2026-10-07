import { ConflictException, Injectable } from '@nestjs/common';
import { lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { WAGO_RUNTIME_MAX_BYTES } from './wago-runtime-artifacts-verification';
import { RuntimeArtifactUpload } from './wago-runtime-artifacts.contracts';

import { WagoRuntimeArtifactCatalogAcquireOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-acquire-operation';

export { WAGO_RUNTIME_MAX_BYTES } from './wago-runtime-artifacts-verification';
export type { RuntimeArtifactManifest } from './wago-runtime-artifacts-verification';
// The name is an atomic ownership marker: no mkdir/write-marker crash window and no
// lease expiry that could collect a slow live owner. Unknown/remote owners and reused
// live PIDs are retained conservatively. UUIDs prevent names being reused by a new process.

export class WagoRuntimeArtifactCatalog extends WagoRuntimeArtifactCatalogAcquireOperation {
  constructor(storageRoot: string, maxBytes = WAGO_RUNTIME_MAX_BYTES) {
    super(storageRoot, maxBytes);
  }
}

export { type RuntimeArtifactMetadata } from './wago-runtime-artifacts.contracts';
export { type VerifiedRuntimeArtifact } from './wago-runtime-artifacts.contracts';
export { type RuntimeArtifactUpload } from './wago-runtime-artifacts.contracts';
export { artifactDirectory } from './wago-runtime-artifacts.helpers';
export { openArtifactFile } from './wago-runtime-artifacts.helpers';
export { writeArtifactStream } from './wago-runtime-artifacts.helpers';
@Injectable()
export class WagoRuntimeArtifactsService extends WagoRuntimeArtifactCatalog {
  private readonly buildDirectory = resolve(
    process.env.WAGO_CC100_BUILD_ASSETS_PATH?.trim() ||
      join(process.env.STORAGE_ROOT ?? join(process.cwd(), 'storage'), 'cc100-runtime'),
  );
  private owned?: Promise<WagoRuntimeArtifactCatalog>;

  constructor() {
    // Existing application setting and exact default from apps/api/src/config/storage.config.ts.
    // Plugin providers are constructed before the host ModuleRef is available.
    super(resolve(process.env.STORAGE_ROOT ?? join(process.cwd(), 'storage')));
  }

  private buildCatalog(): Promise<WagoRuntimeArtifactCatalog> {
    const directory = this.buildDirectory;
    // Lazy loading avoids a module cycle with the reusable base catalog.
    this.owned ??= import('./wago-build-runtime').then(
      ({ WagoBuildRuntimeCatalog }) =>
        new WagoBuildRuntimeCatalog(
          resolve(process.env.STORAGE_ROOT ?? join(process.cwd(), 'storage')),
          resolve(directory),
        ),
    );
    return this.owned;
  }

  override async onModuleInit() {
    await super.onModuleInit();
    if (process.env.NODE_ENV === 'production') await (await this.buildCatalog()).onModuleInit();
  }

  override async onModuleDestroy() {
    await super.onModuleDestroy();
    if (this.owned) await (await this.owned).onModuleDestroy();
  }

  override async current() {
    // Development can start before the explicit build/install target has run.
    // Never fall back to the legacy mutable import pointer in shared storage.
    if (process.env.NODE_ENV !== 'production') {
      try {
        await lstat(join(this.buildDirectory, 'release.json'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    }
    return (await this.buildCatalog()).current();
  }

  override async list() {
    const current = await this.current();
    return current ? [current] : [];
  }

  override async acquire(digest?: string) {
    if (!(await this.current())) throw new ConflictException('Build and install the bundled CC100 runtime first.');
    return (await this.buildCatalog()).acquire(digest);
  }

  override async import(upload: RuntimeArtifactUpload): Promise<never> {
    for (const stream of Object.values(upload)) stream.destroy();
    throw new ConflictException('The server build owns the CC100 runtime. Custom runtime imports are not supported.');
  }
}
