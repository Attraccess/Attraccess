import { CachedState } from './wago-flow.contracts';
import { MAX_TIMEOUT_MS } from './wago-flow.state';
import { Waiter } from './wago-flow.contracts';
import { WagoFlowServiceReadOperation } from './wago-flow.wago-flow-service-read-operation';


export abstract class WagoFlowServiceWaitOperation extends WagoFlowServiceReadOperation {
  async wait(config: Record<string, unknown>): Promise<CachedState | null> {
    if (
      typeof config.controllerId !== 'number' ||
      typeof config.channelId !== 'string' ||
      typeof config.category !== 'string'
    )
      return null;
    const current = this.read(config);
    if (current && this.matchesCondition(current, config)) return current;
    const timeoutMs =
      typeof config.timeoutMs === 'number' && Number.isFinite(config.timeoutMs) && config.timeoutMs > 0
        ? Math.min(config.timeoutMs, MAX_TIMEOUT_MS)
        : 30_000;
    const waiterKey = this.cacheKey(config.controllerId, config.channelId, config.category);
    return new Promise((resolve) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.waiters.delete(wake);
        const waiters = this.waitersByKey.get(waiterKey);
        waiters?.delete(wake);
        if (!waiters?.size) this.waitersByKey.delete(waiterKey);
      };
      const wake: Waiter = (state, cancel = false) => {
        if (!cancel && (!state || !this.matchesCondition(state, config))) return;
        cleanup();
        resolve(cancel ? null : state);
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, timeoutMs);
      this.waiters.add(wake);
      const waiters = this.waitersByKey.get(waiterKey) ?? new Set<Waiter>();
      waiters.add(wake);
      this.waitersByKey.set(waiterKey, waiters);
    });
  }
}
