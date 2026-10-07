import { WagoNetworkChange } from './wago-network-change.entity';
import { WagoNetworkChangeServiceStatusOperation } from "./wago-network-change.service.wago-network-change-service-status-operation";
export abstract class WagoNetworkChangeServicePhaseOperation extends WagoNetworkChangeServiceStatusOperation {


  protected async phase(row: WagoNetworkChange, phase: WagoNetworkChange['phase'], assertOwned: () => Promise<void>) {
    await assertOwned();
    row.phase = phase;
    row.failure = null;
    row.updatedAt = new Date().toISOString();
    await this.repository.save(row);
  }
}
