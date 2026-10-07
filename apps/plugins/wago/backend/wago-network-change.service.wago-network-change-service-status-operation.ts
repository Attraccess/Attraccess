import {
  NotFoundException
} from '@nestjs/common';
import { WagoMqttCredentialRetirement } from './wago-network-change.entity';
import { WagoController } from './wago-controller.entity';
import { WagoManagedAccess, WagoDeviceOperation } from './wago-managed-access.entity';
import { WagoNetworkChangeServiceRetirePreviousCredentialsOperation } from "./wago-network-change.service.wago-network-change-service-retire-previous-credentials-operation";
export abstract class WagoNetworkChangeServiceStatusOperation extends WagoNetworkChangeServiceRetirePreviousCredentialsOperation {


  async status(controllerId: number) {
    const controller = await this.context.getRepository(WagoController).findOneBy({ id: controllerId });
    if (!controller) throw new NotFoundException('WAGO controller not found');
    const access = await this.context
      .getRepository(WagoManagedAccess)
      .findOne({ where: { controllerId }, order: { sessionId: 'DESC' } });
    const row = await this.repository.findOneBy({ controllerId });
    const lease =
      row && (await this.context.getRepository(WagoDeviceOperation).findOneBy({ fingerprint: row.fingerprint }));
    return {
      available: access?.state === 'managed',
      targetHost: access?.host ?? null,
      mqttServerId: controller.mqttServerId,
      pendingCredentialRetirements: await this.context
        .getRepository(WagoMqttCredentialRetirement)
        .countBy({ controllerId }),
      operation: row
        ? {
            targetHost: row.targetHost,
            mqttServerId: row.mqttServerId,
            phase: row.phase,
            failure: row.failure,
            running: row.phase !== 'completed' && !!lease?.owner && Number(lease.leaseUntil) > Date.now(),
          }
        : null,
    };
  }
}
