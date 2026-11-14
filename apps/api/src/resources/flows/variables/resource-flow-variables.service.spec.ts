import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceFlowVariable, ResourceFlowVariableScope } from '@attraccess/database-entities';
import { projectAuditRow } from '../../../audit/recorder/audit-row';
import { AUDIT_RECORDER } from '../../../audit/recorder/audit-event';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';
import { ResourceFlowVariableChangedEvent } from '../events/flow-variable-changed.event';

const isNullOp = (v: unknown): boolean =>
  v !== null && typeof v === 'object' && (v as Record<string, unknown>)['_type'] === 'isNull';

const matchResourceId = (whereRid: unknown, rowRid: number | null): boolean =>
  isNullOp(whereRid) ? rowRid === null : (whereRid ?? null) === rowRid;

describe('ResourceFlowVariablesService', () => {
  let service: ResourceFlowVariablesService;
  let repo: jest.Mocked<Repository<ResourceFlowVariable>>;
  let emitter: { emit: jest.Mock };
  const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
  let store: ResourceFlowVariable[];

  beforeEach(async () => {
    jest.clearAllMocks();
    store = [];
    repo = {
      findOne: jest.fn(
        ({ where }) =>
          store.find(
            (r) => r.scope === where.scope && r.key === where.key && matchResourceId(where.resourceId, r.resourceId),
          ) ?? null,
      ),
      find: jest.fn(({ where }) =>
        store.filter((r) =>
          (Array.isArray(where) ? where : [where]).some(
            (w) => r.scope === w.scope && matchResourceId(w.resourceId, r.resourceId),
          ),
        ),
      ),
      save: jest.fn(async (row) => {
        const idx = store.findIndex(
          (r) => r.scope === row.scope && r.key === row.key && (row.resourceId ?? null) === r.resourceId,
        );
        const persisted = { ...row, id: row.id ?? store.length + 1, updatedAt: new Date() } as ResourceFlowVariable;
        if (idx >= 0) store[idx] = persisted;
        else store.push(persisted);
        return persisted;
      }),
      delete: jest.fn(async (criteria) => {
        const before = store.length;
        store = store.filter(
          (r) =>
            !(
              r.scope === criteria.scope &&
              r.key === criteria.key &&
              matchResourceId(criteria.resourceId, r.resourceId)
            ),
        );
        return { affected: before - store.length, raw: [] };
      }),
    } as unknown as jest.Mocked<Repository<ResourceFlowVariable>>;

    emitter = { emit: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ResourceFlowVariablesService,
        { provide: getRepositoryToken(ResourceFlowVariable), useValue: repo },
        { provide: EventEmitter2, useValue: emitter },
        { provide: AUDIT_RECORDER, useValue: audit },
      ],
    }).compile();

    service = moduleRef.get(ResourceFlowVariablesService);
  });

  it('returns undefined for missing var', async () => {
    expect(await service.get(ResourceFlowVariableScope.GLOBAL, null, 'missing')).toBeUndefined();
  });

  it('upserts and returns parsed value', async () => {
    await service.set(ResourceFlowVariableScope.GLOBAL, null, 'count', 42, null);
    expect(await service.get(ResourceFlowVariableScope.GLOBAL, null, 'count')).toBe(42);
  });

  it('emits event only when value actually changes', async () => {
    await service.set(ResourceFlowVariableScope.RESOURCE, 7, 'k', { a: 1 }, 7);
    await service.set(ResourceFlowVariableScope.RESOURCE, 7, 'k', { a: 1 }, 7);
    expect(emitter.emit).toHaveBeenCalledTimes(1);
    const [name, evt] = emitter.emit.mock.calls[0];
    expect(name).toBe('resource.flow.variable.changed');
    expect(evt).toBeInstanceOf(ResourceFlowVariableChangedEvent);
    expect(evt.previousValue).toBeUndefined();
    expect(evt.newValue).toEqual({ a: 1 });
  });

  it('emits with previousValue on update', async () => {
    await service.set(ResourceFlowVariableScope.RESOURCE, 7, 'k', 'a', 7);
    emitter.emit.mockClear();
    await service.set(ResourceFlowVariableScope.RESOURCE, 7, 'k', 'b', 7);
    expect(emitter.emit).toHaveBeenCalledTimes(1);
    const [, evt] = emitter.emit.mock.calls[0];
    expect(evt.previousValue).toBe('a');
    expect(evt.newValue).toBe('b');
  });

  it('getAll returns split-by-scope object', async () => {
    await service.set(ResourceFlowVariableScope.RESOURCE, 7, 'foo', 1, 7);
    await service.set(ResourceFlowVariableScope.GLOBAL, null, 'bar', 'baz', 7);
    expect(await service.getAll(7)).toEqual({
      resource: { foo: 1 },
      global: { bar: 'baz' },
    });
  });

  it('delete removes the row', async () => {
    await service.set(ResourceFlowVariableScope.GLOBAL, null, 'k', 'v', null);
    await service.delete(ResourceFlowVariableScope.GLOBAL, null, 'k');
    expect(await service.get(ResourceFlowVariableScope.GLOBAL, null, 'k')).toBeUndefined();
  });

  describe('audit', () => {
    const actor = { id: 9, authenticationMethod: 'api-token' as const, apiTokenId: 3 };
    const R = ResourceFlowVariableScope.RESOURCE;

    it('records a user changing a value with before and after, and never records the flow runtime', async () => {
      await service.set(R, 5, 'mode', 'a', 5);
      await service.set(R, 5, 'mode', 'b', 5, null, actor);

      expect(audit.record).toHaveBeenCalledTimes(1);
      const event = audit.record.mock.calls[0][0];
      expect(event).toMatchObject({
        domain: 'resource',
        action: 'flow_variable.set',
        actor,
        subject: { type: 'resource', id: 5 },
        details: { scope: 'resource', key: 'mode', valueType: 'string', 'before.value': '"a"', 'after.value': '"b"' },
      });
      expect(projectAuditRow(event)).not.toBeNull();
    });

    it('records a first value without a before value, under the route resource for a global variable', async () => {
      await service.set(ResourceFlowVariableScope.GLOBAL, 5, 'limit', 3, 5, null, actor);
      const event = audit.record.mock.calls[0][0];
      expect(event.subject).toEqual({ type: 'resource', id: 5 });
      expect(event.details).toEqual({ scope: 'global', key: 'limit', valueType: 'number', 'after.value': '3' });
    });

    it('records nothing when the value is unchanged', async () => {
      await service.set(R, 5, 'mode', 'a', 5, null, actor);
      audit.record.mockClear();
      await service.set(R, 5, 'mode', 'a', 5, null, actor);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('records a delete that removed a row, and nothing for a missing key', async () => {
      await service.set(R, 5, 'mode', 'a', 5);
      await service.delete(R, 5, 'missing', actor);
      expect(audit.record).not.toHaveBeenCalled();

      await service.delete(R, 5, 'mode', actor);
      const event = audit.record.mock.calls[0][0];
      expect(event).toMatchObject({
        action: 'flow_variable.deleted',
        actor,
        subject: { type: 'resource', id: 5 },
        details: { scope: 'resource', key: 'mode', valueType: 'string', 'before.value': '"a"' },
      });
      expect(projectAuditRow(event)).not.toBeNull();
    });

    it('does not audit a delete without an actor', async () => {
      await service.set(R, 5, 'mode', 'a', 5);
      await service.delete(R, 5, 'mode');
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('redacts the value of a secret-looking key and bounds a huge value', async () => {
      await service.set(R, 5, 'apiToken', 'hunter2', 5, null, actor);
      expect(audit.record.mock.calls[0][0].details['after.value']).toBe('[redacted]');

      await service.set(R, 5, 'blob', 'x'.repeat(20000), 5, null, actor);
      const event = audit.record.mock.calls[1][0];
      expect(Buffer.byteLength(JSON.stringify(event.details), 'utf8')).toBeLessThanOrEqual(4096);
      expect(projectAuditRow(event)).not.toBeNull();
    });
  });
});
