import { ConflictException } from '@nestjs/common';
import { WagoManagedRuntimeServiceRegisterRetirementProbeOperation } from './wago-managed-runtime.wago-managed-runtime-service-register-retirement-probe-operation';


export abstract class WagoManagedRuntimeServiceBindOperation extends WagoManagedRuntimeServiceRegisterRetirementProbeOperation {
  async bind(sessionId: number, controllerId: number): Promise<void> {
    const access = await this.loadSession(sessionId);
    if (!access) return;
    if (access.state !== 'verified' || (access.controllerId !== null && access.controllerId !== controllerId))
      throw new ConflictException('Managed enrolment is not verified for this controller');
    await this.access.update(sessionId, { controllerId });
  }
}
