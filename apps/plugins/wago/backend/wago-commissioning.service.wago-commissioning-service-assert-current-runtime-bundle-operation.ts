import { WagoCommissioningServiceAcquireRuntimeBundleOperation } from "./wago-commissioning.service.wago-commissioning-service-acquire-runtime-bundle-operation";
import { RuntimeReleaseChangedError } from "./wago-commissioning.service.errors";

export abstract class WagoCommissioningServiceAssertCurrentRuntimeBundleOperation extends WagoCommissioningServiceAcquireRuntimeBundleOperation {


  protected async assertCurrentRuntimeBundle(bundle: { digest: string; image?: string }): Promise<void> {
    if (!bundle.image || !this.artifacts) return;
    if ((await this.artifacts.current())?.digest !== bundle.digest) throw new RuntimeReleaseChangedError();
  }
}
