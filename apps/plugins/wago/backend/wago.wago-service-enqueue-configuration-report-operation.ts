import { MAX_PENDING_CONFIGURATION_REPORTS } from './wago.state';
import { WagoServiceOnCommandAcknowledgementOperation } from './wago.wago-service-on-command-acknowledgement-operation';


export abstract class WagoServiceEnqueueConfigurationReportOperation extends WagoServiceOnCommandAcknowledgementOperation {
  protected enqueueConfigurationReport(controllerId: number, payload: Buffer): void {
    const queue = this.configurationReportQueues.get(controllerId) ?? { pending: new Map(), processing: false };
    this.configurationReportQueues.set(controllerId, queue);
    if (queue.processing) {
      // Preserve acknowledgements for distinct immutable revisions in arrival order.
      const revision = this.configurationReportRevision(payload);
      const key = revision ?? Number.NaN;
      if (queue.pending.has(key) || queue.pending.size < MAX_PENDING_CONFIGURATION_REPORTS)
        queue.pending.set(key, payload);
      else this.context.logger.warn(`Dropping excess WAGO configuration report for controller ${controllerId}`);
      return;
    }
    queue.processing = true;
    void this.processConfigurationReports(controllerId, payload, queue);
  }
}
