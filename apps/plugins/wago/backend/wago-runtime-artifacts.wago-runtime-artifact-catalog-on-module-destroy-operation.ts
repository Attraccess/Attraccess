import { WagoRuntimeArtifactCatalogOnModuleInitOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-on-module-init-operation';


export abstract class WagoRuntimeArtifactCatalogOnModuleDestroyOperation extends WagoRuntimeArtifactCatalogOnModuleInitOperation {
  async onModuleDestroy() {
    await this.reconciliation;
    await Promise.all([...this.scans.values()].map((directory) => directory.close()));
    this.scans.clear();
  }
}
