import { configuredFirmwareBaseline } from "./wago-commissioning.service.configured-firmware-baseline";
import { WagoCommissioningServiceOnApplicationBootstrapOperation } from "./wago-commissioning.service.wago-commissioning-service-on-application-bootstrap-operation";
export abstract class WagoCommissioningServiceSupportOperation extends WagoCommissioningServiceOnApplicationBootstrapOperation {


  async support(): Promise<{ firmwareBaseline: string | null; ready: boolean }> {
    return {
      firmwareBaseline: configuredFirmwareBaseline || null,
      ready: Boolean(await this.artifacts?.has()),
    };
  }
}
