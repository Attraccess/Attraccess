import { ConflictException, Injectable } from '@nestjs/common';
import { lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { WagoBuildRuntimeCatalog } from './build';
import { type RuntimeArtifactUpload, WagoRuntimeArtifactCatalog } from './catalog';

/** The plugin's artifact provider: it serves the runtime the server build installed, never an imported one. */
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
    this.owned ??= Promise.resolve(
      new WagoBuildRuntimeCatalog(
        resolve(process.env.STORAGE_ROOT ?? join(process.cwd(), 'storage')),
        resolve(this.buildDirectory),
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
