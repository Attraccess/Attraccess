import {
  NotFoundException
} from '@nestjs/common';
import { WagoCommissioningServicePrepareControllerOperation } from "./wago-commissioning.service.wago-commissioning-service-prepare-controller-operation";
export abstract class WagoCommissioningServiceManagementStatusOperation extends WagoCommissioningServicePrepareControllerOperation {


  async managementStatus(id: number) {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    return session.managementControllerId ? this.management.status(session.managementControllerId) : null;
  }
}
