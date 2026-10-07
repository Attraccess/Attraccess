import { WagoRuntimeArtifactCatalogListOperation } from './wago-runtime-artifacts.wago-runtime-artifact-catalog-list-operation';


export abstract class WagoRuntimeArtifactCatalogHasOperation extends WagoRuntimeArtifactCatalogListOperation {
  async has(): Promise<boolean> {
    try {
      const current = await this.current();
      if (!current) return false;
      await this.verifiedMetadata(await this.root(), current.digest);
      return true;
    } catch {
      return false;
    }
  }
}
