import { lstat } from 'node:fs/promises';
import { opendir } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ownerIsDead } from './wago-runtime-artifacts.helpers';
import { WagoRuntimeArtifactCatalogOnModuleDestroyOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-on-module-destroy-operation';


export abstract class WagoRuntimeArtifactCatalogReconcileOperation extends WagoRuntimeArtifactCatalogOnModuleDestroyOperation {
  protected async reconcile(root: string) {
    for (const [parent, kind] of [
      [join(root, 'staging'), 'upload'],
      [join(root, 'snapshots'), 'delivery'],
      [root, 'current'],
    ]) {
      let scan = this.scans.get(parent);
      if (!scan) {
        scan = await opendir(parent);
        this.scans.set(parent, scan);
      }
      for (let count = 0; count < 32; count++) {
        const entry = await scan.read();
        if (!entry) {
          await scan.close();
          this.scans.delete(parent);
          break;
        }
        if (!ownerIsDead(entry.name, kind)) continue;
        const path = join(parent, entry.name);
        try {
          const info = await lstat(path);
          if (info.isSymbolicLink() || (kind === 'current' ? !info.isFile() : !info.isDirectory())) continue;
          // A proven-dead owner cannot rename this temporary directory into objects or
          // activate its pointer concurrently. Never scan objects or the current pointer.
          await rm(path, { recursive: kind !== 'current', force: true });
        } catch (error) {
          // A second host process may already have reconciled the same dead owner.
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
  }
}
