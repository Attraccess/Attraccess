import { WagoController } from './wago-controller.entity';
import { WagoCommissioningServiceVerificationOperation } from "./wago-commissioning.service.wago-commissioning-service-verification-operation";
export abstract class WagoCommissioningServiceReconcileDiscoveryOperation extends WagoCommissioningServiceVerificationOperation {


  protected async reconcileDiscovery(): Promise<void> {
    for (let skip = 0; ; skip += 100) {
      const page = await this.sessions.find({ order: { id: 'ASC' }, take: 100, skip });
      for (const session of page) {
        if (session.state !== 'awaiting_discovery' || session.enrollmentId === null) continue;
        const controller = await this.context.getRepository(WagoController).findOneBy({
          hardwareId: session.hardwareId,
          mqttServerId: session.mqttServerId,
          enrollmentId: session.enrollmentId,
        });
        if (controller?.trustState === 'untrusted') await this.claimDiscovered(controller);
      }
      if (page.length < 100) return;
    }
  }
}
