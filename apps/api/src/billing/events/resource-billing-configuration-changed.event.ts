export class ResourceBillingConfigurationChangedEvent {
  static readonly EVENT_NAME = 'resource.billing.configuration.changed';

  constructor(public readonly resourceId: number) {}
}
