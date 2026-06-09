import {
  ResourceFlowNode,
  SetVariablesNodeDataSchema,
  ResourceFlowVariableScope,
} from '@attraccess/database-entities';
import { ResourceFlowVariablesService } from '../resource-flow-variables.service';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class SetVariablesExecutor implements NodeExecutor {
  constructor(private readonly variablesService: ResourceFlowVariablesService) {}

  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    const data = SetVariablesNodeDataSchema.parse(node.data);
    for (const item of data.variables) {
      const renderedKey = ctx.compileTemplate(item.key, input);
      const renderedValue = ctx.compileTemplate(item.value, input);
      let parsed: unknown = renderedValue;
      try {
        parsed = JSON.parse(renderedValue);
      } catch {
        // leave as raw string
      }
      const scope = item.scope as ResourceFlowVariableScope;
      const ownerId = scope === ResourceFlowVariableScope.RESOURCE ? node.resourceId : null;
      await this.variablesService.set(scope, ownerId, renderedKey, parsed, node.resourceId);
    }
    return { payload: input };
  }
}
