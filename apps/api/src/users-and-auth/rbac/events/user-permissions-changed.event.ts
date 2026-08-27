export class UserPermissionsChangedEvent {
  static readonly EVENT_NAME = 'user.permissions.changed';

  constructor(public readonly userId?: number) {}
}
