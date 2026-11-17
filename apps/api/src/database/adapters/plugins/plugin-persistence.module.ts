import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  PLUGIN_CORE_LOOKUP,
  PLUGIN_HOST_CONNECTION,
  PLUGIN_HOST_DATA,
} from '../../../plugin-system/persistence/plugin-host-data.port';
import { PLUGIN_BLE_STORE } from '../../../plugin-system/ble/plugin-ble-store.port';
import { PLUGIN_MAINTENANCE_WINDOWS } from '../../../plugin-system/persistence/plugin-maintenance-window.port';
import { createPluginMaintenanceWindows } from './plugin-maintenance-window.adapter';
import { createTypeOrmPluginBleStore } from './typeorm-plugin-ble.store';
import { createPluginCoreLookup, createPluginHostData } from './plugin-host-data.adapter';

/**
 * Provides the plugin runtime's persistence-backed lookups: the host connection for the plugin persistence context,
 * the read-only host data behind `PluginContext.hostData`, the lookups for core service calls and the maintenance
 * window lookup of the plugin event bridge, and the plugin BLE endpoint store.
 */
@Module({
  providers: [
    { provide: PLUGIN_HOST_CONNECTION, useExisting: DataSource },
    {
      provide: PLUGIN_HOST_DATA,
      useFactory: (source: DataSource) => createPluginHostData(() => source),
      inject: [DataSource],
    },
    {
      provide: PLUGIN_CORE_LOOKUP,
      useFactory: (source: DataSource) => createPluginCoreLookup(() => source),
      inject: [DataSource],
    },
    {
      provide: PLUGIN_MAINTENANCE_WINDOWS,
      useFactory: (source: DataSource) => createPluginMaintenanceWindows(() => source),
      inject: [DataSource],
    },
    {
      provide: PLUGIN_BLE_STORE,
      useFactory: (source: DataSource) => createTypeOrmPluginBleStore(() => source),
      inject: [DataSource],
    },
  ],
  exports: [PLUGIN_HOST_CONNECTION, PLUGIN_HOST_DATA, PLUGIN_CORE_LOOKUP, PLUGIN_MAINTENANCE_WINDOWS, PLUGIN_BLE_STORE],
})
export class PluginPersistenceModule {}
