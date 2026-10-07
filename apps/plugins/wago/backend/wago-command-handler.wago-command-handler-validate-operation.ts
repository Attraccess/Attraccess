import { outputBehavior } from '../channel-behavior';
import { supportsOutputAction } from '../channel-behavior';
import type { WagoConfigurationSnapshot } from './configuration';
import { WagoCommandHandlerSchemaOperation } from './wago-command-handler.wago-command-handler-schema-operation';


export abstract class WagoCommandHandlerValidateOperation extends WagoCommandHandlerSchemaOperation {
  async validate(config: Record<string, unknown>, validationContext = new Map<string, unknown>(), manual = false) {
    const parsed = this.parse(config, manual);
    if ('errors' in parsed) return parsed.errors;
    const { controllerId, channelId, action, expectedConfigurationRevision } = parsed.value;
    const controller = await this.cached(validationContext, `wago-controller:${controllerId}`, () =>
      this.dependencies.controllers().findOneBy({ id: controllerId }),
    );
    if (!controller || controller.trustState !== 'claimed')
      return [{ field: 'controllerId', message: 'Select a claimed WAGO controller.' }];
    const revision = await this.cached(validationContext, `wago-applied-revision:${controllerId}`, () =>
      this.dependencies.appliedRevision(controllerId),
    );
    if (!revision) return [{ field: 'controllerId', message: 'The controller has no applied configuration revision.' }];
    if (revision.revision !== expectedConfigurationRevision)
      return [
        {
          field: 'expectedConfigurationRevision',
          message: 'The controller configuration changed. Reopen the node and save the current revision.',
        },
      ];
    const snapshot = JSON.parse(revision.snapshot) as WagoConfigurationSnapshot;
    const channel = snapshot.logicalChannels.find((item) => item.id === channelId);
    if (!channel) return [{ field: 'channelId', message: 'The selected Logical Channel no longer exists.' }];
    if (!channel.capabilities.includes('output'))
      return [{ field: 'channelId', message: 'The selected Logical Channel no longer supports output commands.' }];
    if (action !== 'release' && !supportsOutputAction(channel, action))
      return [
        {
          field: 'action',
          message:
            outputBehavior(channel) === 'pulsed'
              ? action === 'set'
                ? 'This channel is configured as pulsed. Reopen this node and explicitly select Trigger pulse, or change the channel to switched behavior and publish it.'
                : 'This pulsed channel has invalid pulse settings. Correct and publish its controller configuration.'
              : 'This channel is configured as switched. Reopen this node and explicitly select Turn on / turn off, or change the channel to pulsed behavior and publish it.',
        },
      ];
    return [];
  }
}
