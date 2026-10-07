import { ResourceFlowNode } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { randomBytes } from 'crypto';
import { ResourceFlowLogType } from './dto/flow-log.dto';
import { NodeProcessingResult } from './node-executors';
import { FlowExecutionOptions, FlowResourceContext } from './flow-execution.types';
import { FlowExecutionEngineState } from './flow-execution-engine.flow-execution-engine-state';
import { settleFlowBranches } from './settle-flow-branches';

export abstract class FlowExecutionEngineStartFlowOperation extends FlowExecutionEngineState {
  public async startFlow(
    node: ResourceFlowNode | ResourceFlowNode[],
    data: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache: Map<number, FlowResourceContext> = new Map(),
    options: FlowExecutionOptions = {},
  ): Promise<NodeProcessingResult[]> {
    const nodes = Array.isArray(node) ? node : [node];

    return this.flowTimer.timeFlow(nodes[0].type, async () => {
      this.logger.debug(`Processing nodes: ${nodes.map((n) => `ID:${n.id} Type:${n.type}`).join(', ')}`);

      const flowRunId = `${randomBytes(3).toString('base64url').slice(0, 3)}-${randomBytes(3)
        .toString('base64url')
        .slice(0, 3)}-${randomBytes(3).toString('base64url').slice(0, 3)}`;

      this.flowLogs.record({
        flowRunId,
        nodeId: null,
        resourceId: nodes[0].resourceId,
        type: ResourceFlowLogType.FLOW_START,
      });

      let leafResults: NodeProcessingResult[] = [];
      try {
        leafResults = await settleFlowBranches(
          nodes.map((node) => {
            return this.processNode(flowRunId, node, data, transactionManager, resourceContextCache, options);
          }),
        );
        this.logger.log(`Successfully processed all ${nodes.length} flow nodes`);
      } catch (error) {
        this.logger.error(`Failed to process flow nodes`, error.stack);
        throw error;
      } finally {
        this.flowLogs.record({
          flowRunId,
          nodeId: null,
          resourceId: nodes[0].resourceId,
          type: ResourceFlowLogType.FLOW_COMPLETED,
        });
      }
      return leafResults;
    });
  }
}
