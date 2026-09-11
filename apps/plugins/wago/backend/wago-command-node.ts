import type { PluginFlowExecutionNodeDefinition } from '@attraccess/plugins-backend-sdk';
import type { WagoService } from './wago.service';

export const WAGO_COMMAND_NODE_TYPE = 'plugin.wago.command';

export function createWagoCommandNode(service: () => WagoService): PluginFlowExecutionNodeDefinition {
  return {
    type: WAGO_COMMAND_NODE_TYPE,
    label: 'WAGO command',
    description: 'Control a configured WAGO Logical Channel.',
    inputs: ['input'],
    outputs: ['output', 'failure'],
    isOutput: true,
    resolveConfigSchema: (config, schemaContext) => service().commandSchema(config, schemaContext.resourceId),
    validateConfig: (config, validationContext) => service().validateCommandConfig(config, validationContext),
    getFailureBehavior: (config) => service().commandFailureBehavior(config),
    getFailureKind: (error) => service().commandFailureKind(error),
    execute: async (node, input) => {
      await service().executeCommand(node.data);
      return { payload: input };
    },
  };
}
