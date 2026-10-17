import { pluginOperationToken } from '@attraccess/plugins-backend-sdk/v2';
import type { WagoController } from '../../controllers/record';
import type { WagoCredentialRotation } from './records';

export abstract class WagoCredentialPersistence {
  abstract controller(id: number): Promise<WagoController | null>;
  abstract credentialEpoch(controllerId: number): Promise<string | null>;
  abstract rotation(controllerId: number, includeRecoverySecret?: boolean): Promise<WagoCredentialRotation | null>;
  abstract rotationStatus(controllerId: number): Promise<Pick<WagoCredentialRotation, 'phase' | 'revision'> | null>;
  abstract saveRotation(row: WagoCredentialRotation): Promise<void>;
  abstract removeRotation(controllerId: number): Promise<void>;
}

export const WAGO_CREDENTIALS = pluginOperationToken<WagoCredentialPersistence>('wago credential recovery', [
  'controller',
  'credentialEpoch',
  'rotation',
  'rotationStatus',
  'saveRotation',
  'removeRotation',
]);
