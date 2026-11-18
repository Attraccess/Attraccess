import { ResourceHealthStatus } from '@attraccess/application-models';

export class ResourceHealthChangedEvent {
  static readonly EVENT_NAME = 'resource.health.changed';

  constructor(
    public readonly resourceId: number,
    public readonly identifier: string,
    public readonly status: ResourceHealthStatus,
    public readonly reason: string | null,
    public readonly previousStatus: ResourceHealthStatus | null,
  ) {}
}
