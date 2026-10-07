import { CachedState } from './wago-flow.contracts';
import { WagoFlowServiceValidateConfigOperation } from './wago-flow.wago-flow-service-validate-config-operation';


export abstract class WagoFlowServiceReadOperation extends WagoFlowServiceValidateConfigOperation {
  read(config: Record<string, unknown>): CachedState | null {
    if (typeof config.controllerId !== 'number' || typeof config.channelId !== 'string') return null;
    if (typeof config.category === 'string')
      return this.cache.get(this.cacheKey(config.controllerId, config.channelId, config.category)) ?? null;
    const entries = [...this.cache.values()].filter(
      (state) =>
        state.controllerId === config.controllerId &&
        state.channelId === config.channelId &&
        (!config.category || state.category === config.category),
    );
    return entries.sort((left, right) => right.receivedAt - left.receivedAt)[0] ?? null;
  }
}
