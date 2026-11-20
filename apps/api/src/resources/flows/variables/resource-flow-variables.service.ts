import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  FlowVariableRecord,
  ResourceFlowVariableScope,
  ResourceFlowVariableValueType,
} from '@attraccess/application-models';
import { FLOW_VARIABLE_STORE, FlowVariableStore } from '../flow-variable-store.port';
import { AUDIT_RECORDER, AuditActor, AuditRecorder } from '../../../audit/recorder/audit-event';
import { fitAuditTexts } from '../../../audit/policies/projection';
import { REDACTED, isSecretKey, redactFlowData } from '../flow-audit';
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
    @Inject(FLOW_VARIABLE_STORE) private readonly store: FlowVariableStore,
    private readonly eventEmitter: EventEmitter2,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  private resolveResourceId(scope: ResourceFlowVariableScope, resourceId: number | null): number | null {
    return scope === ResourceFlowVariableScope.GLOBAL ? null : resourceId;
  }

  async get(scope: ResourceFlowVariableScope, resourceId: number | null, key: string): Promise<unknown> {
    const ownerId = this.resolveResourceId(scope, resourceId);
    const row = await this.store.find({ scope, resourceId: ownerId, key });
    return row ? this.deserialize(row) : undefined;
  }

  async getMany(
    scope: ResourceFlowVariableScope,
    resourceId: number | null,
    keys: string[],
  ): Promise<Record<string, unknown>> {
    if (keys.length === 0) return {};
    const ownerId = this.resolveResourceId(scope, resourceId);
    const rows = await this.store.findMany(scope, ownerId, keys);
    return Object.fromEntries(rows.map((r) => [r.key, this.deserialize(r)]));
  }

  async getAll(
    resourceId: number | null,
  ): Promise<{ resource: Record<string, unknown>; global: Record<string, unknown> }> {
    const rows = await this.store.findVisibleTo(resourceId);
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
    sourceFlowId: number | null = null,
    actor?: AuditActor,
  ): Promise<void> {
    const ownerId = this.resolveResourceId(scope, resourceId);
    const existing = await this.store.find({ scope, resourceId: ownerId, key });
    const previousValue = existing ? this.deserialize(existing) : undefined;

    if (existing && deepEqual(previousValue, value)) {
      return;
    }

    const serialized = JSON.stringify(value);
    const row = await this.store.save(
      { scope, resourceId: ownerId, key },
      serialized,
      classifyValueType(value),
      existing,
    );

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
        sourceFlowId,
      ),
    );

    if (actor && resourceId !== null) {
      await this.recordVariable('flow_variable.set', actor, resourceId, scope, key, row.valueType, {
        'before.value': existing ? previousValue : undefined,
        'after.value': value,
      });
    }
  }

  /** Records a user's change of a variable. `resourceId` is the resource whose flow page was used. */
  private async recordVariable(
    action: 'flow_variable.set' | 'flow_variable.deleted',
    actor: AuditActor,
    resourceId: number,
    scope: ResourceFlowVariableScope,
    key: string,
    valueType: ResourceFlowVariableValueType,
    values: Record<'before.value' | 'after.value', unknown>,
  ): Promise<void> {
    const secret = isSecretKey(key);
    const serialized = Object.fromEntries(
      Object.entries(values)
        .filter(([, value]) => value !== undefined)
        .map(([field, value]) => [field, secret ? REDACTED : (JSON.stringify(redactFlowData(value)) ?? '')]),
    );
    await this.audit.record({
      domain: 'resource',
      action,
      actor,
      subject: { type: 'resource', id: resourceId },
      details: { scope, valueType, ...fitAuditTexts({ key, ...serialized }, { scope, valueType }) },
    });
  }

  async delete(
    scope: ResourceFlowVariableScope,
    resourceId: number | null,
    key: string,
    actor?: AuditActor,
  ): Promise<void> {
    const ownerId = this.resolveResourceId(scope, resourceId);
    const existing = actor ? await this.store.find({ scope, resourceId: ownerId, key }) : null;
    const deleted = await this.store.delete({ scope, resourceId: ownerId, key });
    if (actor && existing && resourceId !== null && deleted) {
      await this.recordVariable('flow_variable.deleted', actor, resourceId, scope, key, existing.valueType, {
        'before.value': this.deserialize(existing),
        'after.value': undefined,
      });
    }
  }

  async listForResource(resourceId: number): Promise<FlowVariableRecord[]> {
    return this.store.listForResource(resourceId);
  }

  parseValue(row: FlowVariableRecord): unknown {
    return this.deserialize(row);
  }

  private deserialize(row: FlowVariableRecord): unknown {
    try {
      return JSON.parse(row.value);
    } catch {
      this.logger.warn(`Variable ${row.scope}:${row.resourceId}:${row.key} stored as raw string`);
      return row.value;
    }
  }
}
