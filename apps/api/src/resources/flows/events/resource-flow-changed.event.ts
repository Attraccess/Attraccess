export class ResourceFlowChangedEvent {
  static readonly EVENT_NAME = 'resource.flow.changed';

  constructor(public readonly resourceId: number) {}
}
