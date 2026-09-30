import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { ResourceOperatingIntervalService } from '../../operating-intervals/resource-operating-interval.service';
import { ExternalEffectFailureError } from '../errors/external-effect-failure.error';
import { OperatingTransitionExecutor } from './operating-transition.executor';

describe('OperatingTransitionExecutor', () => {
  it('emits the configured transition for its resource and preserves the payload', async () => {
    const transitions = {
      transition: jest.fn().mockResolvedValue(null),
    } as unknown as ResourceOperatingIntervalService;
    const executor = new OperatingTransitionExecutor(transitions, 'operating');
    const node = {
      id: 'operating-node',
      resourceId: 7,
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_OPERATING,
    } as ResourceFlowNode;
    const payload = { source: 'mqtt' };

    const transactionManager = {} as EntityManager;

    await expect(
      executor.execute(node, payload, { transactionManager, flowRunId: 'flow-run' } as never),
    ).resolves.toEqual({ payload });
    expect(transitions.transition).toHaveBeenCalledWith(7, 'operating', {
      flowNodeId: 'operating-node',
      flowRunId: 'flow-run',
    });
  });

  it('emits an idle transition', async () => {
    const transitions = {
      transition: jest.fn().mockResolvedValue(null),
    } as unknown as ResourceOperatingIntervalService;
    const executor = new OperatingTransitionExecutor(transitions, 'idle');
    const node = {
      id: 'idle-node',
      resourceId: 7,
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_IDLE,
    } as ResourceFlowNode;

    await executor.execute(node, {}, {} as never);

    expect(transitions.transition).toHaveBeenCalledWith(7, 'idle', { flowNodeId: 'idle-node', flowRunId: undefined });
  });

  it('makes rejected transitions fatal to the calling lifecycle', async () => {
    const rejection = new Error('Server clock precedes the last operating transition');
    const transitions = {
      transition: jest.fn().mockRejectedValue(rejection),
    } as unknown as ResourceOperatingIntervalService;
    const executor = new OperatingTransitionExecutor(transitions, 'idle');
    const node = {
      id: 'idle-node',
      resourceId: 7,
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_IDLE,
    } as ResourceFlowNode;

    await expect(executor.execute(node, {}, {} as never)).rejects.toEqual(
      expect.objectContaining<Partial<ExternalEffectFailureError>>({
        message: 'Operating transition failed',
        cause: rejection,
      }),
    );
  });
});
