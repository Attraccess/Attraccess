import { lstat, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WagoRuntimeArtifactCatalog } from './wago-runtime-artifacts';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskReconcilesKilledOwnersOnAccessWhileRetainingActiveOwnersImmutableObjectsAndUnknownEntri(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('reconciles killed owners on access while retaining active owners, immutable objects, and unknown entries', async () => {
    const metadata = await scope.catalog.import(scope.upload());
    const snapshot = await scope.catalog.acquire();
    const activeUpload = await scope.catalog.createUploadDirectory();
    const catalogRoot = await scope.catalog.root();
    const owner = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    await once(owner, 'spawn');
    const name = (kind: string) =>
      basename(activeUpload).replace('upload-', `${kind}-`).replace(`-${process.pid}-`, `-${owner.pid}-`);
    const abandonedUpload = join(catalogRoot, 'staging', name('upload'));
    const abandonedSnapshot = join(catalogRoot, 'snapshots', name('delivery'));
    const pointer = join(catalogRoot, name('current'));
    const unknown = join(catalogRoot, 'staging', 'upload-unknown');
    try {
      await mkdir(abandonedUpload);
      await writeFile(join(abandonedUpload, 'partial'), 'partial upload');
      await mkdir(abandonedSnapshot);
      await writeFile(pointer, metadata.digest);
      await mkdir(unknown);
      // A live owner must survive regardless of another catalog's startup.
      const restarted = new WagoRuntimeArtifactCatalog(scope.root);
      await restarted.current();
      await restarted.onModuleDestroy();
      expect((await lstat(abandonedUpload)).isDirectory()).toBe(true);
      expect((await lstat(abandonedSnapshot)).isDirectory()).toBe(true);
      expect(await readFile(pointer, 'utf8')).toBe(metadata.digest);
      const exited = once(owner, 'exit');
      owner.kill('SIGKILL');
      await exited;
      await scope.catalog.current();
      for (const path of [abandonedUpload, abandonedSnapshot, pointer])
        await expect(lstat(path)).rejects.toMatchObject({ code: 'ENOENT' });
      expect((await lstat(activeUpload)).isDirectory()).toBe(true);
      expect((await lstat(unknown)).isDirectory()).toBe(true);
      expect(await readFile(snapshot.path)).toEqual(scope.bundle());
      expect(await scope.catalog.current()).toEqual(metadata);
      expect(await scope.catalog.list()).toEqual([metadata]);
      // Dead-owner names still cannot authorize following a symlink.
      await symlink(snapshot.directory, abandonedUpload);
      await symlink(snapshot.path, pointer);
      await scope.catalog.current();
      expect((await lstat(abandonedUpload)).isSymbolicLink()).toBe(true);
      expect((await lstat(pointer)).isSymbolicLink()).toBe(true);
      expect(await readFile(snapshot.path)).toEqual(scope.bundle());
    } finally {
      if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL');
      await snapshot.cleanup();
    }
  });
}
