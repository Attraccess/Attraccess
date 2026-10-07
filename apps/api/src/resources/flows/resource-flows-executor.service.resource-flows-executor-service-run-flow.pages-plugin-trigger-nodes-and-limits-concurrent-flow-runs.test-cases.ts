import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerPluginFlowNodes } from '../../plugin-system/plugin-flow-node-registry';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerPagesPluginTriggerNodesAndLimitsConcurrentFlowRunsCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it('pages plugin trigger nodes and limits concurrent flow runs', async () => {
    registerPluginFlowNodes('pagination-test', [
      {
        type: 'plugin.pagination-test.trigger',
        label: 'Pagination test trigger',
        configSchema: {},
        inputs: [],
        outputs: ['output'],
        isInput: true,
      },
    ]);
    fixture.initialNodes = Array.from({ length: 101 }, (_, index) =>
      fixture.createNode({
        id: `node-${String(index).padStart(3, '0')}`,
        type: 'plugin.pagination-test.trigger' as ResourceFlowNodeType,
      }),
    );

    let inFlight = 0;
    let maxInFlight = 0;
    jest.spyOn(fixture.service, 'startFlow').mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return [];
    });

    await fixture.service.triggerPluginFlows('pagination-test', 'plugin.pagination-test.trigger', () => true, {});

    expect(fixture.flowNodeRepository.find as jest.Mock).toHaveBeenNthCalledWith(1, {
      where: { type: 'plugin.pagination-test.trigger' },
      order: { id: 'ASC' },
      take: 100,
    });
    expect(fixture.flowNodeRepository.find as jest.Mock).toHaveBeenNthCalledWith(2, {
      where: {
        type: 'plugin.pagination-test.trigger',
        id: expect.objectContaining({ _value: 'node-099' }),
      },
      order: { id: 'ASC' },
      take: 100,
    });
    expect(maxInFlight).toBeLessThanOrEqual(10);
    expect(fixture.service.startFlow).toHaveBeenCalledTimes(101);
  });
}
