import { Injectable, Logger } from '@nestjs/common';
import { FlowVariablePersistence } from '../persistence/port';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ResourceFlowVariable,
  ResourceFlowVariableScope,
  ResourceFlowVariableValueType,
} from '@attraccess/application-models';
import { ResourceFlowVariableChangedEvent } from '../events/flow-variable-changed.event';

function classifyValueType(value: unknown): ResourceFlowVariableValueType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'object') return t;
  return 'string';
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

@Injectable()
export class ResourceFlowVariablesService {
  private readonly logger = new Logger(ResourceFlowVariablesService.name);

  constructor(
    private readonly persistence: FlowVariablePersistence,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private resolveResourceId(scope: ResourceFlowVariableScope, resourceId: number | null): number | null {
    return scope === ResourceFlowVariableScope.GLOBAL ? null : resourceId;
  }

  async get(scope: ResourceFlowVariableScope, resourceId: number | null, key: string): Promise<unknown> {
    const ownerId = this.resolveResourceId(scope, resourceId);
    const row = await this.persistence.findValue(scope, ownerId, key);
    return row ? this.deserialize(row) : undefined;
  }

  async getMany(
    scope: ResourceFlowVariableScope,
    resourceId: number | null,
    keys: string[],
  ): Promise<Record<string, unknown>> {
    if (keys.length === 0) return {};
    const ownerId = this.resolveResourceId(scope, resourceId);
    const rows = await this.persistence.findValues(scope, ownerId, keys);
    return Object.fromEntries(rows.map((r) => [r.key, this.deserialize(r)]));
  }

  async getAll(
    resourceId: number | null,
  ): Promise<{ resource: Record<string, unknown>; global: Record<string, unknown> }> {
    const rows = await this.persistence.visibleValues(resourceId, false);
    const out = { resource: {} as Record<string, unknown>, global: {} as Record<string, unknown> };
    for (const r of rows) {
      const target = r.scope === ResourceFlowVariableScope.GLOBAL ? out.global : out.resource;
      target[r.key] = this.deserialize(r);
    }
    return out;
  }

  async set(
    scope: ResourceFlowVariableScope,
    resourceId: number | null,
    key: string,
    value: unknown,
    sourceResourceId: number | null,
  ): Promise<void> {
    const ownerId = this.resolveResourceId(scope, resourceId);
    const existing = await this.persistence.findValue(scope, ownerId, key);
    const previousValue = existing ? this.deserialize(existing) : undefined;

    if (existing && deepEqual(previousValue, value)) {
      return;
    }

    const serialized = JSON.stringify(value);
    const row = await this.persistence.storeValue({
      ...(existing ?? {}),
      scope,
      resourceId: ownerId,
      key,
      value: serialized,
      valueType: classifyValueType(value),
    });

    this.eventEmitter.emit(
      ResourceFlowVariableChangedEvent.EVENT_NAME,
      new ResourceFlowVariableChangedEvent(
        scope,
        ownerId,
        key,
        previousValue,
        value,
        row.updatedAt ?? new Date(),
        sourceResourceId,
      ),
    );
  }

  async delete(scope: ResourceFlowVariableScope, resourceId: number | null, key: string): Promise<void> {
    await this.persistence.removeValue(scope, this.resolveResourceId(scope, resourceId), key);
  }

  async listForResource(resourceId: number): Promise<ResourceFlowVariable[]> {
    return this.persistence.visibleValues(resourceId, true);
  }

  parseValue(row: ResourceFlowVariable): unknown {
    return this.deserialize(row);
  }

  private deserialize(row: ResourceFlowVariable): unknown {
    try {
      return JSON.parse(row.value);
    } catch {
      this.logger.warn(`Variable ${row.scope}:${row.resourceId}:${row.key} stored as raw string`);
      return row.value;
    }
  }
}
