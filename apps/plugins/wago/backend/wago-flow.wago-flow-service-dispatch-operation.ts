import { WAGO_EVENT_NODE_TYPE } from './wago-state-nodes';
import { WagoFlowServicePayloadOperation } from './wago-flow.wago-flow-service-payload-operation';


export abstract class WagoFlowServiceDispatchOperation extends WagoFlowServicePayloadOperation {
  protected async dispatch(): Promise<void> {
    this.dispatching = true;
    while (this.dispatches.length) {
      const dispatch = this.dispatches.shift();
      if (!dispatch) continue;
      const { state, previous } = dispatch;
      const stream = this.streams.get(state.controllerId);
      if (stream?.active !== state.streamId || stream.exhausted) continue;
      try {
        await this.context.flows.trigger(
          WAGO_EVENT_NODE_TYPE,
          (config, nodeId) => this.matchesEvent(config, nodeId, state, previous),
          { wago: this.payload(state) },
        );
      } catch (error) {
        this.context.logger.warn(`Could not trigger WAGO flows: ${String(error)}`);
      }
    }
    this.dispatching = false;
  }
}
