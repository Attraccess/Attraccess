import { CachedState } from './wago-flow.contracts';
import { WagoFlowServiceFreshnessOperation } from './wago-flow.wago-flow-service-freshness-operation';


export abstract class WagoFlowServicePayloadOperation extends WagoFlowServiceFreshnessOperation {
  payload(state: CachedState) {
    const payload = { ...state };
    delete payload.invalidated;
    return { ...payload, ...this.freshness(state) };
  }
}
