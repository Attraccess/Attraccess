import { ResourceFlowVariableScope } from '@attraccess/database-entities';

export class ResourceFlowVariableChangedEvent {
  static readonly EVENT_NAME = 'resource.flow.variable.changed';

  constructor(
    public readonly scope: ResourceFlowVariableScope,
    public readonly resourceId: number | null,
    public readonly key: string,
    public readonly previousValue: unknown,
    public readonly newValue: unknown,
    public readonly changedAt: Date,
    public readonly sourceResourceId: number | null,
  ) {}
}
