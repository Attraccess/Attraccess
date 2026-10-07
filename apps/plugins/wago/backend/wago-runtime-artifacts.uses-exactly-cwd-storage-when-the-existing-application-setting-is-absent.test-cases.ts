import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import type { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
import { readdir } from 'node:fs/promises';
import { Test } from '@nestjs/testing';
import { rm } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { WagoRuntimeArtifactCatalog } from './wago-runtime-artifacts';

export function registerUsesExactlyCwdStorageWhenTheExistingApplicationSettingIsAbsent(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('uses exactly cwd/storage when the existing application setting is absent', async () => {
    const previous = process.env.STORAGE_ROOT;
    delete process.env.STORAGE_ROOT;
    const cwd = jest.spyOn(process, 'cwd').mockReturnValue(scope.root);
    try {
      const service = new WagoRuntimeArtifactsService();
      expect(await service.root()).toBe(await realpath(join(scope.root, 'storage', 'wago-runtime-artifacts')));
      await service.onModuleDestroy();
    } finally {
      cwd.mockRestore();
      if (previous !== undefined) process.env.STORAGE_ROOT = previous;
    }
  });
}

export function registerUsesExistingStorageRootWithoutAccessingThePluginContextOrHostModuleRef(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('uses existing STORAGE_ROOT without accessing the plugin context or host ModuleRef', async () => {
    const previous = process.env.STORAGE_ROOT;
    process.env.STORAGE_ROOT = scope.root;
    const get = jest.fn(() => {
      throw new Error('Host ModuleRef is not ready');
    });
    try {
      const module = await Test.createTestingModule({
        providers: [
          WagoRuntimeArtifactsService,
          { provide: Symbol.for('attraccess.plugin.context'), useValue: { get } },
        ],
      }).compile();
      expect(await module.get(WagoRuntimeArtifactsService).has()).toBe(false);
      expect(get).not.toHaveBeenCalled();
      expect(await readdir(scope.root)).toEqual([]);
      await module.close();
    } finally {
      if (previous === undefined) delete process.env.STORAGE_ROOT;
      else process.env.STORAGE_ROOT = previous;
    }
  });
}

export function registerValidatesASelectedCatalogArtifactWithoutCreatingADeliverySnapshot(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('validates a selected catalog artifact without creating a delivery snapshot', async () => {
    const imported = await scope.catalog.import(scope.upload());

    expect(await scope.catalog.get(imported.digest)).toEqual(imported);
    expect(await readdir(join(await scope.catalog.root(), 'snapshots'))).toEqual([]);
    await rm(join(await scope.catalog.root(), 'objects', imported.digest, 'runtime.tar'));
    await expect(scope.catalog.get(imported.digest)).rejects.toThrow();
  });
}

export function registerVerifiedlyBackfillsMetadataForCatalogObjectsWrittenBeforeMetadataPersistence(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('verifiedly backfills metadata for catalog objects written before metadata persistence', async () => {
    const imported = await scope.catalog.import(scope.upload());
    const metadataPath = join(await scope.catalog.root(), 'objects', imported.digest, 'metadata.json');
    await rm(metadataPath);

    // Reimporting the same release must repair the existing object rather than discard staged metadata.
    await scope.catalog.import(scope.upload());
    const restarted = new WagoRuntimeArtifactCatalog(scope.root);
    expect(await restarted.current()).toEqual(imported);
    expect(await restarted.list()).toEqual([imported]);
    expect(await restarted.has()).toBe(true);
    expect(JSON.parse(await readFile(metadataPath, 'utf8'))).toEqual(imported);
    await restarted.onModuleDestroy();
  });
}
