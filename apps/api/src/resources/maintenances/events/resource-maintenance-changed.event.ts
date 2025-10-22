export class ResourceMaintenanceChangedEvent {
  static readonly EVENT_NAME = 'resource.maintenance.changed';

  constructor(
    public readonly resourceId: number,
    public readonly maintenanceId: number,
  ) {}
}
