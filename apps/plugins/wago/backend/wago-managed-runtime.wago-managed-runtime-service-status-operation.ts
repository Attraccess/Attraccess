import { WagoManagedRuntimeServiceEnrolOperation } from './wago-managed-runtime.service.wago-managed-runtime-service-enrol-operation';


export abstract class WagoManagedRuntimeServiceStatusOperation extends WagoManagedRuntimeServiceEnrolOperation {
  async status(controllerId: number) {
    const access = await this.access.findOne({ where: { controllerId }, order: { sessionId: 'DESC' } });
    return this.publicStatus(access, controllerId);
  }
}
