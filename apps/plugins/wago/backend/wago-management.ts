import type { PluginSecretsContext } from '@attraccess/plugins-backend-sdk';
import { generateManagementKey } from './wago-management-key';
import type { ManagementAdapter, ManagementKey, ManagementStore } from './wago-management.types';
import { WagoManagementServiceLockedOperation } from './wago-management.wago-management-service-locked-operation';

export class WagoManagementService extends WagoManagementServiceLockedOperation {
  constructor(
    store: ManagementStore,
    secrets: PluginSecretsContext,
    adapter: ManagementAdapter,
    now = Date.now,
    createKey: () => ManagementKey = generateManagementKey,
  ) {
    super(store, secrets, adapter, now, createKey);
  }
}

export { ManagementError } from './wago-management.errors.classes';
