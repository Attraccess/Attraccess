import type { CommissioningOperationGuard } from './wago-operation-guard';
import { WagoCredentialRotationEntity } from './wago-credential-rotation.entity';
import { Credential } from './wago-credential-rotation.credential';
import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';

export abstract class WagoCredentialRotationServiceStatusContract {
  abstract status(
    controllerId: number,
  ): Promise<
    | { state: WagoCredentialRotationEntity['phase']; revision: WagoCredentialRotationEntity['revision'] }
    | { state: 'none'; revision?: undefined }
  >;
  abstract assertRemovalBroker(controllerId: number, mqttServerId: number): Promise<void>;
  abstract rotate(
    controllerId: number,
    prefix: string,
    principal: PluginAuditPrincipal,
    guard: CommissioningOperationGuard,
    retry?: boolean,
  ): Promise<{ state: 'completed'; revision: WagoCredentialRotationEntity['revision'] }>;
  protected abstract handoff(
    hardwareId: string,
    row: WagoCredentialRotationEntity,
    credential: Credential,
    guard: CommissioningOperationGuard,
  ): Promise<void>;
}
