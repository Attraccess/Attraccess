import { WagoController } from './wago-controller.entity';
import type { WagoOperationalMessage } from './protocol';
import { STALE_AFTER_MS } from './wago-flow.state';
import { OperationalStream } from './wago-flow.contracts';
import type { WagoConfigurationSnapshot } from './configuration';
import { WagoFlowServiceAdmitEventOperation } from './wago-flow.wago-flow-service-admit-event-operation';


export abstract class WagoFlowServiceApplyStateOperation extends WagoFlowServiceAdmitEventOperation {
  protected applyState(
    controller: WagoController,
    event: Extract<WagoOperationalMessage, { category: 'state' }>,
    eventTime: number,
    stream: OperationalStream,
    channels: WagoConfigurationSnapshot['logicalChannels'],
  ): void {
    const wasUnavailable =
      this.offlineControllers.has(controller.id) ||
      this.unavailableHardware.has(controller.id) ||
      this.unavailableConfiguration.has(controller.id) ||
      (stream.stateTimestamp !== undefined && Date.now() - stream.stateTimestamp > STALE_AFTER_MS);
    stream.stateTimestamp = eventTime;
    if (event.connected) this.offlineControllers.delete(controller.id);
    else this.offlineControllers.add(controller.id);
    if (event.readiness?.hardwareAvailable === false) this.unavailableHardware.add(controller.id);
    else if (event.readiness?.hardwareAvailable === true) this.unavailableHardware.delete(controller.id);
    const applied = this.appliedConfigurations.get(controller.id);
    if (applied && event.revision === applied.revision && event.contentHash === applied.contentHash)
      this.unavailableConfiguration.delete(controller.id);
    else this.unavailableConfiguration.add(controller.id);
    const invalidateSamples =
      wasUnavailable ||
      !event.connected ||
      this.unavailableHardware.has(controller.id) ||
      this.unavailableConfiguration.has(controller.id);
    if (invalidateSamples) stream.sampleNotBefore = Math.max(stream.sampleNotBefore, eventTime);
    // A state message is a complete snapshot. Missing values are unavailable, never held as current.
    for (const state of this.cache.values()) {
      if (state.controllerId !== controller.id) continue;
      if (invalidateSamples || state.category === 'state') state.invalidated = true;
    }
    for (const channel of channels) {
      const value =
        channel.capabilities.includes('input') && Object.hasOwn(event.inputs ?? {}, channel.id)
          ? event.inputs[channel.id]
          : channel.capabilities.includes('output') && Object.hasOwn(event.outputs, channel.id)
            ? event.outputs[channel.id]
            : undefined;
      if (typeof value === 'boolean') this.store(controller, channel.id, event, value);
    }
  }
}
