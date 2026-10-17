import { pluginOperationToken } from '@attraccess/plugins-backend-sdk/v2';
import type { ShellyDevice } from '../device.record';
import type { AuthState } from '../../types';

export interface DeviceProbeFields {
  generation: number | null;
  model: string | null;
  authState: AuthState;
  lastProbeAt: string | null;
  lastProbeError: string | null;
}

export interface DeviceRegistryOperations {
  list(): Promise<ShellyDevice[]>;
  findById(id: number): Promise<ShellyDevice | null>;
  findByIp(ipAddress: string): Promise<ShellyDevice | null>;
  create(record: Omit<ShellyDevice, 'id'>): Promise<ShellyDevice>;
  updateProbe(id: number, patch: DeviceProbeFields, updatedAt: string): Promise<void>;
  updateAuthState(id: number, authState: AuthState, updatedAt: string): Promise<void>;
  remove(id: number): Promise<void>;
}

export const SHELLY_DEVICES = pluginOperationToken<DeviceRegistryOperations>('shelly device registry', [
  'list',
  'findById',
  'findByIp',
  'create',
  'updateProbe',
  'updateAuthState',
  'remove',
]);
