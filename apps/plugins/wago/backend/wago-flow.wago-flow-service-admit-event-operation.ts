import { WagoController } from './wago-controller.entity';
import type { WagoOperationalMessage } from './protocol';
import { STALE_AFTER_MS } from './wago-flow.state';
import { MAX_RETIRED_STREAMS } from './wago-flow.state';
import { OperationalStream } from './wago-flow.contracts';
import { WagoFlowServiceProcessMessageOperation } from './wago-flow.wago-flow-service-process-message-operation';


export abstract class WagoFlowServiceAdmitEventOperation extends WagoFlowServiceProcessMessageOperation {
  protected admitEvent(
    controller: WagoController,
    event: WagoOperationalMessage,
    eventTime: number,
  ): OperationalStream | undefined {
    let stream = this.streams.get(controller.id);
    if (stream?.exhausted) return undefined;
    if (!stream || stream.active !== event.streamId) {
      if (
        event.category !== 'state' ||
        stream?.retired.has(event.streamId) ||
        (stream &&
          (!event.connected || Date.now() - eventTime > STALE_AFTER_MS || eventTime <= stream.latestSourceTime))
      ) {
        this.context.logger.warn(`Ignoring unestablished or retired WAGO stream for ${controller.hardwareId}`);
        return undefined;
      }
      if (stream && stream.retired.size >= MAX_RETIRED_STREAMS) {
        stream.exhausted = true;
        for (const state of this.cache.values()) if (state.controllerId === controller.id) state.invalidated = true;
        this.context.logger.warn(
          `WAGO stream history exhausted for ${controller.hardwareId}; refusing further samples`,
        );
        return undefined;
      }
      const retired = stream?.retired ?? new Set<string>();
      if (stream) retired.add(stream.active);
      stream = {
        active: event.streamId,
        latestSourceTime: eventTime,
        sampleNotBefore: eventTime,
        retired,
        sequences: new Map(),
      };
      this.streams.set(controller.id, stream);
      for (const state of this.cache.values()) if (state.controllerId === controller.id) state.invalidated = true;
    }
    const previous = stream.sequences.get(event.category);
    if (previous !== undefined && event.sequence <= previous) {
      this.context.logger.warn(`Ignoring duplicate or out-of-order WAGO event for ${controller.hardwareId}`);
      return undefined;
    }
    if (previous !== undefined && event.sequence > previous + 1)
      this.context.logger.warn(
        `WAGO event sequence gap for ${controller.hardwareId}: ${previous} to ${event.sequence}`,
      );
    stream.sequences.set(event.category, event.sequence);
    stream.latestSourceTime = Math.max(stream.latestSourceTime, eventTime);
    return stream;
  }
}
