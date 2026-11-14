import { Logger } from '@nestjs/common';
import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { getPluginFlowNode } from '../../../plugin-system/flows/node-registry';
import { FlowExecutionEngine } from './flow-execution-engine';
import { FlowExecutionContext } from './flow-execution-context';

jest.mock('../../../plugin-system/flows/node-registry', () => ({ getPluginFlowNode: jest.fn() }));

describe('FlowExecutionEngine', () => {
  it('rejects a core node whose executor was never attached instead of asking the plugin registry', async () => {
    const context = { resolveRunResourceId: () => null } as unknown as FlowExecutionContext;
    const engine = new FlowExecutionEngine(null, null, null, null, {}, context, new Logger('test')) as unknown as {
      dispatchNode(flowRunId: string, node: ResourceFlowNode, input: object): Promise<unknown>;
    };
    const node = { id: 'n1', type: ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION } as ResourceFlowNode;

    await expect(engine.dispatchNode('run', node, {})).rejects.toThrow(
      'No executor attached for core flow node type: output.resource.usage.end-session',
    );
    expect(getPluginFlowNode).not.toHaveBeenCalled();
  });
});
