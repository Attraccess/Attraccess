import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { temporaryName } from './wago-runtime-artifacts.helpers';
import { WagoRuntimeArtifactCatalogReconcileOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-reconcile-operation';


export abstract class WagoRuntimeArtifactCatalogCreateTemporaryDirectoryOperation extends WagoRuntimeArtifactCatalogReconcileOperation {
  protected async createTemporaryDirectory(parent: string, kind: 'upload' | 'delivery') {
    const directory = join(parent, temporaryName(kind));
    await mkdir(directory, { mode: 0o700 });
    return directory;
  }
}
