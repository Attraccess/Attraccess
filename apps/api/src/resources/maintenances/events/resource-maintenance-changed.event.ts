/** `updated` is reserved for a future edit path; core currently emits only `created` and `finished`. */
export type ResourceMaintenanceChangeAction = 'created' | 'updated' | 'finished';

export class ResourceMaintenanceChangedEvent {
  static readonly EVENT_NAME = 'resource.maintenance.changed';

  constructor(
    public readonly resourceId: number,
    public readonly maintenanceId: number,
    public readonly action: ResourceMaintenanceChangeAction,
  ) {}
}
