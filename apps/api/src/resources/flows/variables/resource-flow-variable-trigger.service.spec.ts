import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceFlowNode, ResourceFlowNodeType, ResourceFlowVariableScope } from '@attraccess/database-entities';
import { ResourceFlowVariableChangedEvent } from '../events/flow-variable-changed.event';
import { ResourceFlowVariableTriggerService } from './resource-flow-variable-trigger.service';
import { ResourceFlowsExecutorService } from '../execution/resource-flows-executor.service';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';

const node = (
  id: string,
  resourceId: number,
  watches: Array<{ scope: string; key: string }>,
  source: 'any' | 'exclude-self' = 'any',
) =>
  ({
    id,
    type: ResourceFlowNodeType.INPUT_VARIABLE_CHANGED,
    resourceId,
    data: { watches, source },
  }) as unknown as ResourceFlowNode;

describe('ResourceFlowVariableTriggerService', () => {
  let triggerService: ResourceFlowVariableTriggerService;
  let nodeRepo: jest.Mocked<Repository<ResourceFlowNode>>;
  let executor: jest.Mocked<ResourceFlowsExecutorService>;
  let variables: jest.Mocked<ResourceFlowVariablesService>;

  beforeEach(async () => {
    nodeRepo = { find: jest.fn() } as never;
    executor = { startFlow: jest.fn() } as never;
    variables = {
      getMany: jest.fn(async () => ({ a: 1 })),
    } as never;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ResourceFlowVariableTriggerService,
        { provide: getRepositoryToken(ResourceFlowNode), useValue: nodeRepo },
        { provide: ResourceFlowsExecutorService, useValue: executor },
        { provide: ResourceFlowVariablesService, useValue: variables },
      ],
    }).compile();

    triggerService = moduleRef.get(ResourceFlowVariableTriggerService);
  });

  it('starts flow only for nodes whose watches match the event', async () => {
    nodeRepo.find.mockResolvedValueOnce([
      node('match', 7, [{ scope: 'resource', key: 'a' }]),
      node('miss', 8, [{ scope: 'resource', key: 'other' }]),
    ]);

    await triggerService.handle(
      new ResourceFlowVariableChangedEvent(ResourceFlowVariableScope.RESOURCE, 7, 'a', 0, 1, new Date(), 7),
    );

    expect(executor.startFlow).toHaveBeenCalledTimes(1);
    expect((executor.startFlow.mock.calls[0][0] as ResourceFlowNode).id).toBe('match');
  });

  it('drops same-source events when source=exclude-self', async () => {
    nodeRepo.find.mockResolvedValueOnce([node('self', 7, [{ scope: 'global', key: 'k' }], 'exclude-self')]);

    await triggerService.handle(
      new ResourceFlowVariableChangedEvent(ResourceFlowVariableScope.GLOBAL, null, 'k', 0, 1, new Date(), 7),
    );

    expect(executor.startFlow).not.toHaveBeenCalled();
  });

  it('payload exposes change meta and current watched values', async () => {
    nodeRepo.find.mockResolvedValueOnce([node('n', 7, [{ scope: 'global', key: 'k' }])]);
    const changedAt = new Date();

    await triggerService.handle(
      new ResourceFlowVariableChangedEvent(ResourceFlowVariableScope.GLOBAL, null, 'k', 0, 9, changedAt, 8),
    );

    const [, input] = executor.startFlow.mock.calls[0];
    expect((input.payload as Record<string, unknown>).change).toEqual({
      scope: 'global',
      key: 'k',
      previousValue: 0,
      newValue: 9,
      changedAt: changedAt.toISOString(),
      sourceResourceId: 8,
    });
    expect((input.payload as Record<string, unknown>).variables).toBeDefined();
  });

  describe('global flows', () => {
    const globalNode = (
      id: string,
      flowId: number,
      watches: Array<{ scope: string; key: string }>,
      source: 'any' | 'exclude-self' = 'any',
    ) => ({ ...node(id, null as never, watches, source), flowId }) as ResourceFlowNode;

    it('fires a resource-scope watch for any resource and makes it the triggering resource', async () => {
      const global = globalNode('g', 1, [{ scope: 'resource', key: 'a' }]);
      nodeRepo.find.mockResolvedValueOnce([global]);

      await triggerService.handle(
        new ResourceFlowVariableChangedEvent(ResourceFlowVariableScope.RESOURCE, 42, 'a', 0, 1, new Date(), 42),
      );

      expect(executor.startFlow).toHaveBeenCalledTimes(1);
      expect(executor.startFlow.mock.calls[0][4]).toEqual({ triggeringResourceId: 42 });
      expect(variables.getMany).toHaveBeenCalledWith(ResourceFlowVariableScope.RESOURCE, 42, ['a']);
    });

    it('fires a global-scope watch without a triggering resource', async () => {
      nodeRepo.find.mockResolvedValueOnce([globalNode('g', 1, [{ scope: 'global', key: 'a' }])]);

      await triggerService.handle(
        new ResourceFlowVariableChangedEvent(ResourceFlowVariableScope.GLOBAL, null, 'a', 0, 1, new Date(), null),
      );

      expect(executor.startFlow.mock.calls[0][4]).toEqual({ triggeringResourceId: null });
    });

    it('excludes changes made by the same global flow when source is exclude-self', async () => {
      nodeRepo.find.mockResolvedValueOnce([
        globalNode('self', 1, [{ scope: 'global', key: 'a' }], 'exclude-self'),
        globalNode('other', 2, [{ scope: 'global', key: 'a' }], 'exclude-self'),
      ]);

      await triggerService.handle(
        new ResourceFlowVariableChangedEvent(ResourceFlowVariableScope.GLOBAL, null, 'a', 0, 1, new Date(), null, 1),
      );

      expect(executor.startFlow.mock.calls.map(([n]) => (n as ResourceFlowNode).id)).toEqual(['other']);
    });
  });

  it('only loads variable triggers of resource flows and enabled global flows', async () => {
    nodeRepo.find.mockResolvedValueOnce([]);

    await triggerService.handle(
      new ResourceFlowVariableChangedEvent(ResourceFlowVariableScope.RESOURCE, 7, 'a', 0, 1, new Date(), 7),
    );

    expect(nodeRepo.find).toHaveBeenCalledWith({
      where: [
        expect.objectContaining({ type: ResourceFlowNodeType.INPUT_VARIABLE_CHANGED, resourceId: 7 }),
        {
          type: ResourceFlowNodeType.INPUT_VARIABLE_CHANGED,
          flow: { enabled: true, scope: 'global' },
        },
      ],
    });
  });
});
