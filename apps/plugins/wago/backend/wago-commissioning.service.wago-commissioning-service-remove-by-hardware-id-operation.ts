import { WagoCommissioningServiceRemoveOperation } from "./wago-commissioning.service.wago-commissioning-service-remove-operation";
export abstract class WagoCommissioningServiceRemoveByHardwareIdOperation extends WagoCommissioningServiceRemoveOperation {


  async removeByHardwareId(hardwareId: string): Promise<void> {
    const sessions = await this.sessions.find({ where: { hardwareId } });
    await Promise.all(sessions.map((session) => this.remove(session.id)));
  }
}
