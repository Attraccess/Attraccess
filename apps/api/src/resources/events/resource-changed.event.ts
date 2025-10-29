export class ResourceChangedEvent {
  static readonly EVENT_NAME = 'resource.changed';

  constructor(public readonly resourceId: number) {}
}
