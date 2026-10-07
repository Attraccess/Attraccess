import { CommissioningSessionResponse } from "./wago-commissioning.service.commissioning-session-response";
import { WagoCommissioningServiceConfirmHostKeyOperation } from "./wago-commissioning.service.wago-commissioning-service-confirm-host-key-operation";
export abstract class WagoCommissioningServiceListOperation extends WagoCommissioningServiceConfirmHostKeyOperation {


  async list(limit = 50, offset = 0): Promise<CommissioningSessionResponse[]> {
    const take = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
    const skip = Number.isSafeInteger(offset) ? Math.max(offset, 0) : 0;
    const sessions = await this.sessions.find({ order: { updatedAt: 'DESC' }, take, skip });
    return Promise.all(sessions.map((session) => this.toResponse(session)));
  }
}
