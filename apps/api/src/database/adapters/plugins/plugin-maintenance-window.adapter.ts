import { ResourceMaintenance } from '@attraccess/database-entities';
import type { DataSource } from 'typeorm';
import type {
  PluginMaintenanceWindowPort,
  PluginMaintenanceWindowRecord,
} from '../../../plugin-system/persistence/plugin-maintenance-window.port';

/** TypeORM implementation of the maintenance window lookup. */
export function createPluginMaintenanceWindows(source: () => DataSource): PluginMaintenanceWindowPort {
  return {
    async findWindow(maintenanceId: number): Promise<PluginMaintenanceWindowRecord | null> {
      const row = await source()
        .getRepository(ResourceMaintenance)
        .findOne({ where: { id: maintenanceId } });
      return row ? { startTime: row.startTime, endTime: row.endTime ?? null } : null;
    },
  };
}
