/** The effective session limit of a resource changed. Emitted after the change was saved. */
export class ResourceSessionLimitChangedEvent {
  static readonly EVENT_NAME = 'resource.session-limit.changed';

  constructor(
    public readonly resourceId: number,
    public readonly previousLimit: number,
    public readonly newLimit: number,
    public readonly actorUserId: number | null,
  ) {}
}
