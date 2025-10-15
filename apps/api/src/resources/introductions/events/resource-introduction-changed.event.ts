export class ResourceIntroductionChangedEvent {
  static readonly EVENT_NAME = 'resource.introduction.changed';

  constructor(public readonly introductionId: number) {}
}
