export class ResourceGroupIntroducerChangedEvent {
  static readonly EVENT_NAME = 'resource.group.introducer.changed';

  constructor(public readonly resourceGroupId: number) {}
}
