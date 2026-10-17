import { pluginOperationToken } from '@attraccess/plugins-backend-sdk/v2';
import type { WagoManagedAccess } from '../access.record';
import type { WagoController } from '../../../controllers/record';
import type { WagoNetworkChange } from '../../../network/record';

export abstract class WagoManagedPersistence {
  abstract latestAccess(controllerId: number): Promise<WagoManagedAccess | null>;
  abstract access(sessionId: number): Promise<WagoManagedAccess | null>;
  abstract managedCredentials(controllerId: number): Promise<WagoManagedAccess | null>;
  abstract sessionCredentials(sessionId: number): Promise<WagoManagedAccess | null>;
  abstract saveAccess(input: WagoManagedAccess): Promise<WagoManagedAccess>;
  abstract updateAccess(sessionId: number, patch: Partial<WagoManagedAccess>): Promise<void>;
  abstract retireControllerAccess(controllerId: number): Promise<void>;
  abstract setUnretiredState(sessionId: number, state: 'verified' | 'managed' | 'recovery_required'): Promise<boolean>;
  abstract claimedControllerPage(offset: number): Promise<WagoController[]>;
  abstract networkIntent(controllerId: number | null, fingerprint?: string): Promise<WagoNetworkChange | null>;
  abstract retirementCount(controllerId: number): Promise<number>;
  abstract updateMetadata(controllerId: number): Promise<string | null>;
  abstract initializeUpdate(controllerId: number): Promise<void>;
  abstract saveUpdate(
    controllerId: number,
    metadata: string,
    fingerprint: string,
    owner: string,
    now: number,
  ): Promise<boolean>;
}
export const WAGO_MANAGED_RUNTIME = pluginOperationToken<WagoManagedPersistence>('wago managed runtime recovery', [
  'latestAccess',
  'access',
  'managedCredentials',
  'sessionCredentials',
  'saveAccess',
  'updateAccess',
  'retireControllerAccess',
  'setUnretiredState',
  'claimedControllerPage',
  'networkIntent',
  'retirementCount',
  'updateMetadata',
  'initializeUpdate',
  'saveUpdate',
]);
