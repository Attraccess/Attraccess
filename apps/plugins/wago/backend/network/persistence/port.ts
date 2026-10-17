import { pluginOperationToken } from '@attraccess/plugins-backend-sdk/v2';
import type { WagoController } from '../../controllers/record';
import type { WagoManagedAccess } from '../../runtime/managed/access.record';
import type { WagoCredentialRotation } from '../../credentials/persistence/records';
import type { WagoNetworkChange, WagoMqttCredentialRetirement } from '../record';

export interface NetworkBindingChanges {
  controllerId: number;
  sessionId: number;
  targetHost: string;
  encryptedCredentials: string;
  broker?: {
    mqttServerId: number;
    retirePreviousServerId: number | null;
    credentialEpoch: string;
    token: string;
    prefix: string;
    updatedAt: string;
  };
}
export abstract class WagoNetworkPersistence {
  abstract managedAccess(controllerId: number, managedOnly?: boolean): Promise<WagoManagedAccess | null>;
  abstract controller(controllerId: number, claimedOnly?: boolean): Promise<WagoController | null>;
  abstract intent(controllerId: number, includeSecret?: boolean): Promise<WagoNetworkChange | null>;
  abstract saveIntent(input: WagoNetworkChange): Promise<void>;
  abstract rotationPhase(controllerId: number): Promise<WagoCredentialRotation['phase'] | null>;
  abstract updateMetadata(controllerId: number): Promise<string | null>;
  /** The reviewed ownership callback runs inside the one existing binding transaction, without engine access. */
  abstract commitBindings(changes: NetworkBindingChanges, assertOwned: () => Promise<void>): Promise<void>;
  abstract retirementCount(controllerId: number): Promise<number>;
  abstract retirements(controllerId: number): Promise<WagoMqttCredentialRetirement[]>;
  abstract removeRetirement(controllerId: number, mqttServerId: number): Promise<void>;
}
export const WAGO_NETWORK = pluginOperationToken<WagoNetworkPersistence>('wago network recovery', [
  'managedAccess',
  'controller',
  'intent',
  'saveIntent',
  'rotationPhase',
  'updateMetadata',
  'commitBindings',
  'retirementCount',
  'retirements',
  'removeRetirement',
]);
