export class ResourceOperatingStateChangedEvent {
  static readonly EVENT_NAME = 'resource.operating.state.changed';

  constructor(
    public readonly resourceId: number,
    public readonly state: 'operating' | 'idle',
  ) {}
}
