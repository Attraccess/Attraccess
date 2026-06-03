export class MaintenanceRequestCreatedEvent {
  static readonly EVENT_NAME = 'resource.maintenance-request.created';

  constructor(
    public readonly resourceId: number,
    public readonly requestId: number,
  ) {}
}
