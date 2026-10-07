import type { PluginSecretsContext } from '@attraccess/plugins-backend-sdk';
import { generateManagementKey } from './wago-management-key';
import type { ManagementAdapter } from './wago-management.types';
import type { ManagementKey } from './wago-management.types';
import type { ManagementStore } from './wago-management.types';
import { WagoManagementServiceStatusContract } from './wago-management.wago-management-service-status-contract';


export abstract class WagoManagementServiceState extends WagoManagementServiceStatusContract {
  constructor(
    protected readonly store: ManagementStore,
    protected readonly secrets: PluginSecretsContext,
    protected readonly adapter: ManagementAdapter,
    protected readonly now = Date.now,
    protected readonly createKey: () => ManagementKey = generateManagementKey,
  ) {
    super();
  }
}
