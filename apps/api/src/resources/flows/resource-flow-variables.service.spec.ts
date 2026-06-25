import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceFlowVariable, ResourceFlowVariableScope } from '@attraccess/database-entities';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';
import { ResourceFlowVariableChangedEvent } from './events/flow-variable-changed.event';

const isNullOp = (v: unknown): boolean =>
  v !== null && typeof v === 'object' && (v as Record<string, unknown>)['_type'] === 'isNull';

const matchResourceId = (whereRid: unknown, rowRid: number | null): boolean =>
  isNullOp(whereRid) ? rowRid === null : (whereRid ?? null) === rowRid;

describe('ResourceFlowVariablesService', () => {
  let service: ResourceFlowVariablesService;
  let repo: jest.Mocked<Repository<ResourceFlowVariable>>;
  let emitter: { emit: jest.Mock };
  let store: ResourceFlowVariable[];

  beforeEach(async () => {
    store = [];
    repo = {
      findOne: jest.fn(({ where }) =>
        store.find(
          (r) =>
            r.scope === where.scope &&
            r.key === where.key &&
            matchResourceId(where.resourceId, r.resourceId),
        ) ?? null,
      ),
      find: jest.fn(({ where }) =>
        store.filter((r) =>
          (Array.isArray(where) ? where : [where]).some(
            (w) =>
              r.scope === w.scope &&
              matchResourceId(w.resourceId, r.resourceId),
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
          (r) => !(r.scope === criteria.scope && r.key === criteria.key && (criteria.resourceId ?? null) === r.resourceId),
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
});
