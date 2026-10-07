import { randomUUID } from 'node:crypto';
import { mkdir, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WagoRuntimeArtifactCatalog } from './wago-runtime-artifacts';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskBoundsStartupReconciliationAndContinuesBeyondRetainedEntriesOnLaterAccesses(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('bounds startup reconciliation and continues beyond retained entries on later accesses', async () => {
    const active = await scope.catalog.createUploadDirectory();
    const staging = join(await scope.catalog.root(), 'staging');
    const owner = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    await once(owner, 'spawn');
    const restarted = new WagoRuntimeArtifactCatalog(scope.root);
    try {
      // Force the cursor to encounter more entries than a single bounded pass.
      for (let i = 0; i < 40; i++) await mkdir(join(staging, `unowned-${i}`));
      for (let i = 0; i < 40; i++) {
        const name = basename(active)
          .replace(`-${process.pid}-`, `-${owner.pid}-`)
          .replace(/[a-f0-9-]{36}$/, randomUUID());
        await mkdir(join(staging, name));
      }
      const exited = once(owner, 'exit');
      owner.kill('SIGKILL');
      await exited;
      await restarted.onModuleInit();
      expect((await readdir(staging)).length).toBeGreaterThanOrEqual(49);
      for (let i = 0; i < 4; i++) await restarted.root();
      const retained = await readdir(staging);
      expect(retained).toHaveLength(41);
      expect(retained).toContain(basename(active));
    } finally {
      if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL');
      await restarted.onModuleDestroy();
    }
  });
}
