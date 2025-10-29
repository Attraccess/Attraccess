export class ResourceIntroducerChangedEvent {
  static readonly EVENT_NAME = 'resource.introducer.changed';

  constructor(
    public readonly resourceId: number,
    public readonly introducerUserId: number,
  ) {}
}
