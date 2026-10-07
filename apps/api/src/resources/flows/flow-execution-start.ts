import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { randomBytes } from 'crypto';
import { EntityManager } from 'typeorm';
import { getPluginFlowNode } from '../../plugin-system/plugin-flow-node-registry';
import { ResourceFlowLogType } from './dto/flow-log.dto';
import { ExternalEffectFailureError } from './errors/external-effect-failure.error';
import { FlowPluginTriggerImplementation } from './flow-plugin-trigger';
import { NodeExecutionContext, NodeProcessingResult } from './node-executors';
import { FlowExecutionOptions, FlowResourceContext } from './resource-flows-executor.service.feature-definitions';
export abstract class FlowExecutionStartImplementation extends FlowPluginTriggerImplementation {
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
        leafResults = await this.settleFlowBranches(
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

  protected async settleFlowBranches(branches: Promise<NodeProcessingResult[]>[]): Promise<NodeProcessingResult[]> {
    // A failed branch cannot release a lifecycle reservation while sibling effects are still running.
    // Wait for work already started, then preserve lifecycle-fatal failures over ordinary node errors.
    let failure: { error: unknown } | undefined;
    const results = await Promise.allSettled(
      branches.map((branch) =>
        branch.catch((error) => {
          if (
            !failure ||
            (error instanceof ExternalEffectFailureError && !(failure.error instanceof ExternalEffectFailureError))
          ) {
            failure = { error };
          }
          throw error;
        }),
      ),
    );
    if (failure) throw failure.error;
    return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  }

  /**
   * Builds the per-execution context handed to node executors. Exposes the
   * template helpers backed by the service-owned WeakMap so executors stay free
   * of Handlebars/variable plumbing.
   */
  protected buildExecutionContext(
    flowRunId: string,
    transactionManager?: EntityManager,
    options: FlowExecutionOptions = {},
  ): NodeExecutionContext {
    return {
      flowRunId,
      lifecycleAttemptId: options.lifecycleAttemptId,
      lifecycleCandidateCancellation: options.lifecycleCandidateCancellation,
      metering: options.metering,
      transactionManager,
      compileTemplate: (template, data) => this.compileTemplate(template, data),
      getTemplateVariables: (data) => this.templateVariables.get(data),
      setTemplateVariables: (data, variables) => this.templateVariables.set(data, variables),
    };
  }

  protected async dispatchNode(
    flowRunId: string,
    node: ResourceFlowNode,
    input: object,
    transactionManager?: EntityManager,
    options: FlowExecutionOptions = {},
  ): Promise<NodeProcessingResult> {
    // Core node types are looked up in the exhaustive record.
    const executor = this.nodeExecutors[node.type as ResourceFlowNodeType];
    if (executor) {
      return executor.execute(node, input, this.buildExecutionContext(flowRunId, transactionManager, options));
    }

    // Plugin-contributed node types fall through to the plugin registry.
    const pluginNode = getPluginFlowNode(node.type);
    if (pluginNode) {
      if (pluginNode.isInput) {
        return { payload: input, outputHandle: 'output' };
      }
      return pluginNode.execute(
        { id: node.id, type: node.type, data: node.data as Record<string, unknown> },
        input,
        this.buildExecutionContext(flowRunId, transactionManager, options),
      );
    }

    throw new Error(`No executor found for flow node type: ${node.type}`);
  }
}
