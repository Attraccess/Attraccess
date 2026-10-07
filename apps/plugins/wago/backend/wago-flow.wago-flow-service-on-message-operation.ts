import { WagoFlowServiceWaitOperation } from './wago-flow.wago-flow-service-wait-operation';


export abstract class WagoFlowServiceOnMessageOperation extends WagoFlowServiceWaitOperation {
  protected onMessage(serverId: number, prefix: string, topic: string, payload: Buffer): Promise<void> {
    const queued = this.messageQueue
      .catch(() => undefined)
      .then(() => this.processMessage(serverId, prefix, topic, payload));
    this.messageQueue = queued;
    return queued;
  }
}
