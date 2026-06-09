import { Logger } from '@nestjs/common';
import {
  ResourceFlowNode,
  GetVariablesNodeDataSchema,
  ResourceFlowVariableScope,
} from '@attraccess/database-entities';
import { set as lodashSet } from 'lodash-es';
import { ResourceFlowVariablesService } from '../resource-flow-variables.service';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class GetVariablesExecutor implements NodeExecutor {
  private readonly logger = new Logger(GetVariablesExecutor.name);

  constructor(private readonly variablesService: ResourceFlowVariablesService) {}

  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    const data = GetVariablesNodeDataSchema.parse(node.data);
    const payload = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
    for (const item of data.variables) {
      const renderedKey = ctx.compileTemplate(item.key, input);
      const scope = item.scope as ResourceFlowVariableScope;
      const ownerId = scope === ResourceFlowVariableScope.RESOURCE ? node.resourceId : null;
      const value = await this.variablesService.get(scope, ownerId, renderedKey);
      if (value === undefined) {
        this.logger.warn(`GET variable miss: ${item.scope}:${renderedKey}`);
      }
      lodashSet(payload, item.payloadPath, value);
    }
    const variables = ctx.getTemplateVariables(input);
    if (variables) {
      ctx.setTemplateVariables(payload, variables);
    }
    return { payload };
  }
}
