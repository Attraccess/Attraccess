import { CachedState } from './wago-flow.contracts';
import { WagoFlowServiceMatchesEventOperation } from './wago-flow.wago-flow-service-matches-event-operation';


export abstract class WagoFlowServiceMatchesConditionOperation extends WagoFlowServiceMatchesEventOperation {
  protected matchesCondition(state: CachedState, config: Record<string, unknown>): boolean {
    return this.freshness(state).available && (config.equals === undefined || state.value === config.equals);
  }
}
