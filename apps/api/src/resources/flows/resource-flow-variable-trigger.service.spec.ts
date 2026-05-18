import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceFlowVariableScope,
} from '@attraccess/database-entities';
import { FlowVariableChangedEvent } from './events/flow-variable-changed.event';
import { ResourceFlowVariableTriggerService } from './resource-flow-variable-trigger.service';
import { ResourceFlowsExecutorService } from './resource-flows-executor.service';
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
  } as unknown as ResourceFlowNode);

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
      new FlowVariableChangedEvent(ResourceFlowVariableScope.RESOURCE, 7, 'a', 0, 1, new Date(), 7),
    );

    expect(executor.startFlow).toHaveBeenCalledTimes(1);
    expect((executor.startFlow.mock.calls[0][0] as ResourceFlowNode).id).toBe('match');
  });

  it('drops same-source events when source=exclude-self', async () => {
    nodeRepo.find.mockResolvedValueOnce([
      node('self', 7, [{ scope: 'global', key: 'k' }], 'exclude-self'),
    ]);

    await triggerService.handle(
      new FlowVariableChangedEvent(ResourceFlowVariableScope.GLOBAL, null, 'k', 0, 1, new Date(), 7),
    );

    expect(executor.startFlow).not.toHaveBeenCalled();
  });

  it('payload exposes change meta and current watched values', async () => {
    nodeRepo.find.mockResolvedValueOnce([node('n', 7, [{ scope: 'global', key: 'k' }])]);
    const changedAt = new Date();

    await triggerService.handle(
      new FlowVariableChangedEvent(ResourceFlowVariableScope.GLOBAL, null, 'k', 0, 9, changedAt, 8),
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
});
