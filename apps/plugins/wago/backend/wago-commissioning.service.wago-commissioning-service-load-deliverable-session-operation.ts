import {
  ConflictException,
  NotFoundException
} from '@nestjs/common';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCommissioningServiceDeliverOperation } from "./wago-commissioning.service.wago-commissioning-service-deliver-operation";
export abstract class WagoCommissioningServiceLoadDeliverableSessionOperation extends WagoCommissioningServiceDeliverOperation {


  protected async loadDeliverableSession(id: number): Promise<WagoCommissioningSession> {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    if (
      !['awaiting_delivery', 'delivering', 'awaiting_codesys_confirmation', 'delivery_failed'].includes(session.state)
    )
      throw new ConflictException('commissioning session cannot be delivered in its current state');
    return session;
  }
}
