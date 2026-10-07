import { WagoCredentialRotationServiceState } from './wago-credential-rotation.wago-credential-rotation-service-state';


export abstract class WagoCredentialRotationServiceStatusOperation extends WagoCredentialRotationServiceState {
  async status(controllerId: number) {
    const row = await this.repository.findOne({ where: { controllerId }, select: { phase: true, revision: true } });
    return row ? { state: row.phase, revision: row.revision } : { state: 'none' as const };
  }
}
