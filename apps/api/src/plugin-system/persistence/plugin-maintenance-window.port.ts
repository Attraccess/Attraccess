/** DI token of the maintenance window lookup the plugin event bridge uses. */
export const PLUGIN_MAINTENANCE_WINDOWS = Symbol.for('attraccess.plugin-system.maintenance-windows');

/** A persisted maintenance window. An open-ended window has no end. */
export interface PluginMaintenanceWindowRecord {
  startTime: Date;
  endTime: Date | null;
}

export interface PluginMaintenanceWindowPort {
  /** The persisted window of a maintenance; null when it no longer exists. */
  findWindow(maintenanceId: number): Promise<PluginMaintenanceWindowRecord | null>;
}
