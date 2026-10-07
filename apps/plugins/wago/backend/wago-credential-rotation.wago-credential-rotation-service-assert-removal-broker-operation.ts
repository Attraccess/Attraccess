import { ConflictException } from '@nestjs/common';
import { WagoCredentialRotationServiceStatusOperation } from './wago-credential-rotation.wago-credential-rotation-service-status-operation';


export abstract class WagoCredentialRotationServiceAssertRemovalBrokerOperation extends WagoCredentialRotationServiceStatusOperation {
  /** Call inside guarded removal, before its existing broker revocation; deletion then cascades this row. */
  async assertRemovalBroker(controllerId: number, mqttServerId: number): Promise<void> {
    const row = await this.repository.findOneBy({ controllerId });
    if (row && row.mqttServerId !== mqttServerId)
      throw new ConflictException('Revoke the original rotation broker identity before removing this controller.');
  }
}
