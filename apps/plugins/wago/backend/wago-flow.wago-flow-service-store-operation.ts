import { WagoController } from './wago-controller.entity';
import type { WagoOperationalMessage } from './protocol';
import { MAX_CACHE_ENTRIES } from './wago-flow.state';
import { MAX_PENDING_DISPATCHES } from './wago-flow.state';
import { CachedState } from './wago-flow.contracts';
import { WagoFlowServiceApplyStateOperation } from './wago-flow.wago-flow-service-apply-state-operation';


export abstract class WagoFlowServiceStoreOperation extends WagoFlowServiceApplyStateOperation {
  protected store(controller: WagoController, channelId: string, event: WagoOperationalMessage, value: unknown): void {
    const state: CachedState = {
      controllerId: controller.id,
      hardwareId: controller.hardwareId,
      channelId,
      category: event.category,
      value,
      timestamp: event.timestamp,
      sequence: event.sequence,
      streamId: event.streamId,
      ...(event.category === 'measurement' ? { unit: event.unit, kind: event.kind } : {}),
      ...(event.category === 'state' ? { revision: event.revision, contentHash: event.contentHash } : {}),
      receivedAt: Date.now(),
      offline: this.offlineControllers.has(controller.id),
      invalidated:
        this.unavailableHardware.has(controller.id) ||
        this.unavailableConfiguration.has(controller.id) ||
        Date.parse(event.timestamp) < (this.streams.get(controller.id)?.sampleNotBefore ?? 0),
    };
    const cacheKey = this.cacheKey(controller.id, channelId, event.category);
    const previous = this.cache.get(cacheKey);
    this.cache.set(cacheKey, state);
    if (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.waitersByKey.get(cacheKey)?.forEach((wake) => wake(state));
    if (this.dispatches.length >= MAX_PENDING_DISPATCHES) {
      this.context.logger.warn(`Dropping excess WAGO flow dispatch for ${controller.hardwareId}`);
      return;
    }
    this.dispatches.push({ state, previous });
    if (!this.dispatching) void this.dispatch();
  }
}
