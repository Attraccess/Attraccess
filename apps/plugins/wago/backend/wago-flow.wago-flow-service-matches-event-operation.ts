import { CachedState } from './wago-flow.contracts';
import { WagoFlowServiceReadCategoriesOperation } from './wago-flow.wago-flow-service-read-categories-operation';


export abstract class WagoFlowServiceMatchesEventOperation extends WagoFlowServiceReadCategoriesOperation {
  protected matchesEvent(
    config: Record<string, unknown>,
    nodeId: string,
    state: CachedState,
    previous?: CachedState,
  ): boolean {
    if (this.wago?.isRuntimeUpdateRequired(state.controllerId)) return false;
    if (
      config.controllerId !== state.controllerId ||
      config.channelId !== state.channelId ||
      config.category !== state.category
    )
      return false;
    if (
      typeof config.minimumChange === 'number' &&
      typeof state.value === 'number' &&
      typeof previous?.value === 'number' &&
      previous.streamId === state.streamId &&
      previous.unit === state.unit &&
      previous.kind === state.kind &&
      Math.abs(state.value - previous.value) < config.minimumChange
    )
      return false;
    if (typeof config.minimumIntervalMs === 'number') {
      const lastDispatchAt = this.lastDispatchAtByNode.get(nodeId);
      if (lastDispatchAt !== undefined && state.receivedAt - lastDispatchAt < config.minimumIntervalMs) return false;
      this.lastDispatchAtByNode.set(nodeId, state.receivedAt);
    }
    return true;
  }
}
