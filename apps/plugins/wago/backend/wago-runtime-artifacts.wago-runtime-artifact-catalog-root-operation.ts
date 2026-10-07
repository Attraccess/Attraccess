import { mkdir } from 'node:fs/promises';
import { realpath } from 'node:fs/promises';
import { artifactDirectory } from './wago-runtime-artifacts.helpers';
import { WagoRuntimeArtifactCatalogState } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-state';


export abstract class WagoRuntimeArtifactCatalogRootOperation extends WagoRuntimeArtifactCatalogState {
  async root(): Promise<string> {
    await mkdir(this.storageRoot, { recursive: true, mode: 0o700 });
    // Canonicalize only the host-owned root (e.g. macOS /tmp); never canonicalize catalog children.
    const root = await artifactDirectory(await realpath(this.storageRoot), 'wago-runtime-artifacts');
    await artifactDirectory(root, 'objects');
    await artifactDirectory(root, 'staging');
    await artifactDirectory(root, 'snapshots');
    // One bounded pass on first access and each subsequent access. Retaining directory
    // cursors avoids starving later entries behind active or unknown entries.
    if (!this.reconciliation) {
      this.reconciliation = this.reconcile(root).finally(() => {
        this.reconciliation = undefined;
      });
    }
    await this.reconciliation;
    return root;
  }
}
