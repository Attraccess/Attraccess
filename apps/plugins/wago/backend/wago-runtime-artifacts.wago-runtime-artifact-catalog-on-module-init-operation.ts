import { WagoRuntimeArtifactCatalogRootOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-root-operation';


export abstract class WagoRuntimeArtifactCatalogOnModuleInitOperation extends WagoRuntimeArtifactCatalogRootOperation {
  async onModuleInit() {
    await this.root();
  }
}
