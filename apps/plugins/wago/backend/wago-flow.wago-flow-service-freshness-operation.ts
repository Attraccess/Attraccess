import { CONTROLLER_CLOCK_TOLERANCE_MS } from '../shared/clock';
import { STALE_AFTER_MS } from './wago-flow.state';
import { CachedState } from './wago-flow.contracts';
import { WagoFlowServiceMatchesConditionOperation } from './wago-flow.wago-flow-service-matches-condition-operation';


export abstract class WagoFlowServiceFreshnessOperation extends WagoFlowServiceMatchesConditionOperation {
  protected freshness(state: CachedState): {
    stale: boolean;
    offline: boolean;
    connectionStale: boolean;
    available: boolean;
  } {
    const age = Date.now() - Date.parse(state.timestamp);
    const stale = !Number.isFinite(age) || age < -CONTROLLER_CLOCK_TOLERANCE_MS || age > STALE_AFTER_MS;
    const offline = state.offline === true || this.offlineControllers.has(state.controllerId);
    const stream = this.streams.get(state.controllerId);
    const stateTimestamp = stream?.stateTimestamp;
    const connectionAge = stateTimestamp === undefined ? NaN : Date.now() - stateTimestamp;
    const connectionStale =
      !Number.isFinite(connectionAge) ||
      connectionAge < -CONTROLLER_CLOCK_TOLERANCE_MS ||
      connectionAge > STALE_AFTER_MS;
    return {
      stale,
      offline,
      connectionStale,
      available:
        !this.wago?.isRuntimeUpdateRequired(state.controllerId) &&
        !stale &&
        !offline &&
        !connectionStale &&
        stream?.active === state.streamId &&
        !stream.exhausted &&
        Date.parse(state.timestamp) >= stream.sampleNotBefore &&
        !state.invalidated &&
        !this.unavailableHardware.has(state.controllerId) &&
        !this.unavailableConfiguration.has(state.controllerId),
    };
  }
}
