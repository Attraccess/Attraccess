export class ResourceGroupIntroductionChangedEvent {
  static readonly EVENT_NAME = 'resource.group.introduction.changed';

  constructor(public readonly resourceGroupId: number) {}
}
