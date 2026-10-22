import { FlowVariablePersistence } from '../persistence/port';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceFlowVariable, ResourceFlowVariableScope } from '@attraccess/application-models';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';
import { ResourceFlowVariableChangedEvent } from '../events/flow-variable-changed.event';

describe('ResourceFlowVariablesService', () => {
  let service: ResourceFlowVariablesService;
  let persistence: jest.Mocked<FlowVariablePersistence>;
  let emitter: { emit: jest.Mock };
  let store: ResourceFlowVariable[];

  beforeEach(async () => {
    store = [];
    persistence = {
      findValue: jest.fn(
        async (scope, resourceId, key) =>
          store.find((row) => row.scope === scope && row.resourceId === resourceId && row.key === key) ?? null,
      ),
      findValues: jest.fn(async (scope, resourceId, keys) =>
        store.filter((row) => row.scope === scope && row.resourceId === resourceId && keys.includes(row.key)),
      ),
      visibleValues: jest.fn(async (resourceId, ordered) => {
        const rows = store.filter(
          (row) => row.scope === ResourceFlowVariableScope.GLOBAL || row.resourceId === resourceId,
        );
        return ordered ? rows.sort((a, b) => a.key.localeCompare(b.key)) : rows;
      }),
      storeValue: jest.fn(async (row) => {
        const index = store.findIndex(
          (existing) =>
            existing.scope === row.scope && existing.key === row.key && existing.resourceId === row.resourceId,
        );
        const persisted = {
          ...row,
          id: store[index]?.id ?? store.length + 1,
          updatedAt: new Date(),
        } as ResourceFlowVariable;
        if (index >= 0) store[index] = persisted;
        else store.push(persisted);
        return persisted;
      }),
      removeValue: jest.fn(async (scope, resourceId, key) => {
        store = store.filter((row) => !(row.scope === scope && row.resourceId === resourceId && row.key === key));
      }),
    };

    emitter = { emit: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ResourceFlowVariablesService,
        { provide: FlowVariablePersistence, useValue: persistence },
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
