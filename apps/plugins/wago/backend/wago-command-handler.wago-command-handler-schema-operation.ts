import { outputBehavior } from '../channel-behavior';
import type { WagoConfigurationSnapshot } from './configuration';
import { wagoFlowPreview } from './wago-flow-preview';
import { DEFAULT_COMMAND_TIMEOUT_SECONDS } from './wago-command-handler.state';
import { MAX_COMMAND_TIMEOUT_SECONDS } from './wago-command-handler.state';
import { positiveInteger } from './wago-command-handler.helpers';
import { WagoCommandHandlerChannelNamesOperation } from './wago-command-handler.wago-command-handler-channel-names-operation';
export abstract class WagoCommandHandlerSchemaOperation extends WagoCommandHandlerChannelNamesOperation {
  async schema(
    config: Record<string, unknown>,
    resourceId: number,
    previewOnly = false,
  ): Promise<Record<string, unknown>> {
    const controllerId = positiveInteger(config.controllerId);
    const controllers =
      previewOnly && !controllerId
        ? []
        : await this.dependencies.controllers().find({
            where: { trustState: 'claimed', ...(previewOnly ? { id: controllerId } : {}) },
            order: { name: 'ASC' },
          });
    const revision = controllerId ? await this.dependencies.appliedRevision(controllerId) : null;
    const snapshot = revision ? (JSON.parse(revision.snapshot) as WagoConfigurationSnapshot) : null;
    const channelId = typeof config.channelId === 'string' ? config.channelId : undefined;
    const outputChannels = snapshot?.logicalChannels.filter((item) => item.capabilities.includes('output')) ?? [];
    const names = await this.channelNames(controllerId, revision, previewOnly);
    if (previewOnly)
      return {
        dynamic: true,
        type: 'object',
        properties: {},
        preview: wagoFlowPreview(
          config,
          'command',
          controllers.find((item) => item.id === controllerId),
          snapshot,
          names,
        ),
      };
    const channel = outputChannels.find((item) => item.id === channelId);
    const references = channelId && controllerId ? await this.references(controllerId, channelId, resourceId) : [];
    const properties: Record<string, unknown> = {
      controllerId: {
        type: 'number',
        title: 'Controller',
        enum: controllers.map((controller) => controller.id),
        oneOf: controllers.map((controller) => ({
          const: controller.id,
          title: controller.name ?? controller.hardwareId,
        })),
        refreshesSchema: true,
        description:
          controllerId && !revision
            ? 'Publish a configuration and wait for the controller to apply it before authoring commands.'
            : undefined,
      },
    };
    if (controllerId && revision && snapshot) {
      properties.channelId = {
        type: 'string',
        title: 'Logical Channel',
        oneOf: outputChannels.map((item) => ({
          const: item.id,
          title: typeof names[item.id] === 'string' ? names[item.id] : `${item.id} (${item.profile})`,
        })),
        refreshesSchema: true,
        description: references.length
          ? `Also controlled by resource flow node${references.length === 1 ? '' : 's'}: ${references.join(', ')}. Reuse is allowed.`
          : outputChannels.length
            ? undefined
            : 'This applied configuration has no output channels. Add an output and publish it first.',
      };
    }
    if (channel) {
      const pulsed = outputBehavior(channel) === 'pulsed';
      const action = pulsed ? 'pulse' : 'set';
      properties.action = {
        type: 'string',
        title: 'Operation',
        oneOf: [{ const: action, title: pulsed ? 'Trigger pulse' : 'Turn on / turn off' }],
        // Never silently reinterpret an existing incompatible flow action.
        ...(config.action === undefined ? { default: action } : {}),
        refreshesSchema: true,
        description: pulsed
          ? channel.pulse
            ? `Turns on for ${channel.pulse.durationMs} ms, then off automatically. Change the duration in the controller configuration.`
            : 'This pulsed channel is missing its duration. Correct and publish its controller configuration.'
          : 'Stays on or off until another command or the configured disconnect policy changes it.',
      };
      if (!pulsed) properties.value = { type: 'boolean', title: 'Output on', default: false };
      properties.expectedConfigurationRevision = {
        type: 'number',
        title: 'Configuration revision',
        default: revision.revision,
        readOnly: true,
      };
      properties.completionBehavior = {
        type: 'string',
        title: 'Completion',
        oneOf: [
          { const: 'acknowledged', title: 'Wait for controller acknowledgement' },
          { const: 'dispatch', title: 'Publish only' },
        ],
        default: 'acknowledged',
        refreshesSchema: true,
      };
      if (config.completionBehavior !== 'dispatch')
        properties.acknowledgementTimeoutSeconds = {
          type: 'number',
          title: 'Acknowledgement timeout',
          minimum: 1,
          maximum: MAX_COMMAND_TIMEOUT_SECONDS,
          default: DEFAULT_COMMAND_TIMEOUT_SECONDS,
          unit: 'seconds',
        };
      properties.failureBehavior = {
        type: 'string',
        title: 'On failure',
        oneOf: [
          { const: 'fail-flow', title: 'Fail flow' },
          { const: 'failure-output', title: 'Use failure output' },
          { const: 'log-and-continue', title: 'Log and continue' },
        ],
        default: 'fail-flow',
      };
    }
    return {
      dynamic: true,
      type: 'object',
      preview: wagoFlowPreview(
        config,
        'command',
        controllers.find((item) => item.id === controllerId),
        snapshot,
        names,
      ),
      properties,
      required: [
        ...new Set([
          'controllerId',
          'channelId',
          'action',
          'expectedConfigurationRevision',
          ...Object.keys(properties),
        ]),
      ],
    };
  }
}
