import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceOperatingIntervalService } from '../../operating-intervals/resource-operating-interval.service';
import { OperatingTransitionExecutor } from './operating-transition.executor';

describe('OperatingTransitionExecutor', () => {
  it('emits the configured transition for its resource and preserves the payload', async () => {
    const transitions = {
      transition: jest.fn().mockResolvedValue(null),
    } as unknown as ResourceOperatingIntervalService;
    const executor = new OperatingTransitionExecutor(transitions, 'operating');
    const node = { resourceId: 7, type: ResourceFlowNodeType.OUTPUT_RESOURCE_OPERATING } as ResourceFlowNode;
    const payload = { source: 'mqtt' };

    await expect(executor.execute(node, payload, {} as never)).resolves.toEqual({ payload });
    expect(transitions.transition).toHaveBeenCalledWith(7, 'operating');
  });

  it('emits an idle transition', async () => {
    const transitions = {
      transition: jest.fn().mockResolvedValue(null),
    } as unknown as ResourceOperatingIntervalService;
    const executor = new OperatingTransitionExecutor(transitions, 'idle');
    const node = { resourceId: 7, type: ResourceFlowNodeType.OUTPUT_RESOURCE_IDLE } as ResourceFlowNode;

    await executor.execute(node, {}, {} as never);

    expect(transitions.transition).toHaveBeenCalledWith(7, 'idle');
  });
});
