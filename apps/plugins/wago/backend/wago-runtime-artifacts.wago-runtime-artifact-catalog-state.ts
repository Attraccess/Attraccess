import { Dir } from 'node:fs';
import { WAGO_RUNTIME_MAX_BYTES } from './wago-runtime-artifacts-verification';
import { WagoRuntimeArtifactCatalogRootContract } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-root-contract';


export abstract class WagoRuntimeArtifactCatalogState extends WagoRuntimeArtifactCatalogRootContract {
  protected activeImports = 0;

  protected readonly scans = new Map<string, Dir>();

  protected reconciliation?: Promise<void>;

  constructor(
    protected readonly storageRoot: string,
    protected readonly maxBytes = WAGO_RUNTIME_MAX_BYTES,
  ) {
    super();
  }
}
