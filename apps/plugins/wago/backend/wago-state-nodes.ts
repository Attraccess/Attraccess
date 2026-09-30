import type { PluginFlowNodeDefinition } from '@attraccess/plugins-backend-sdk';
import type { WagoFlowService } from './wago-flow.service';
import { WAGO_FLOW_PREVIEW_SCHEMA } from './wago-flow-preview';

export const WAGO_EVENT_NODE_TYPE = 'plugin.wago.event-received';

export function createWagoStateNodes(service: () => WagoFlowService): PluginFlowNodeDefinition[] {
  return [
    {
      type: WAGO_EVENT_NODE_TYPE,
      label: 'WAGO event received',
      description: 'Start a flow when a channel reports state, a measurement, or a fault. Data is available in wago.',
      configSchema: WAGO_FLOW_PREVIEW_SCHEMA,
      isInput: true,
      inputs: [],
      outputs: ['output'],
      resolveConfigSchema: (config, context) =>
        service().resolveConfigSchema(config, 'event', undefined, context.purpose === 'preview'),
      validateConfig: (config, context) => service().validateConfig(config, 'event', context),
    },
    {
      type: 'plugin.wago.read-state',
      label: 'WAGO read state',
      description:
        'Read the latest channel state or measurement into wago. Unavailable data uses the unavailable output.',
      configSchema: WAGO_FLOW_PREVIEW_SCHEMA,
      inputs: ['input'],
      outputs: ['output', 'unavailable'],
      resolveConfigSchema: (config, context) =>
        service().resolveConfigSchema(config, 'read', undefined, context.purpose === 'preview'),
      validateConfig: (config, context) => service().validateConfig(config, 'read', context),
      execute: async (node, input) => {
        const state = service().read(node.data);
        const wago = state ? service().payload(state) : { available: false };
        return { payload: { ...input, wago }, outputHandle: wago.available ? 'output' : 'unavailable' };
      },
    },
    {
      type: 'plugin.wago.wait-for-state',
      label: 'WAGO wait for state',
      description: 'Wait for an available channel value to match, then continue with the value in wago.',
      configSchema: WAGO_FLOW_PREVIEW_SCHEMA,
      inputs: ['input'],
      outputs: ['output', 'timeout'],
      resolveConfigSchema: (config, context) =>
        service().resolveConfigSchema(config, 'wait', undefined, context.purpose === 'preview'),
      validateConfig: (config, context) => service().validateConfig(config, 'wait', context),
      execute: async (node, input) => {
        const state = await service().wait(node.data);
        return {
          payload: { ...input, wago: state ? service().payload(state) : { available: false } },
          outputHandle: state ? 'output' : 'timeout',
        };
      },
    },
  ];
}
