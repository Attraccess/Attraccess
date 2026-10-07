import { WagoServiceEnqueueConfigurationReportOperation } from './wago.wago-service-enqueue-configuration-report-operation';


export abstract class WagoServiceProcessConfigurationReportsOperation extends WagoServiceEnqueueConfigurationReportOperation {
  protected async processConfigurationReports(
    controllerId: number,
    payload: Buffer,
    queue: { pending: Map<number, Buffer>; processing: boolean },
  ): Promise<void> {
    let next: Buffer | null = payload;
    while (next) {
      try {
        await this.onConfigurationReported(controllerId, next);
      } catch (error) {
        this.context.logger.warn(`Could not process WAGO configuration report: ${String(error)}`);
      }
      const pending = queue.pending.entries().next();
      if (pending.done) next = null;
      else {
        const [revision, report] = pending.value;
        queue.pending.delete(revision);
        next = report;
      }
    }
    queue.processing = false;
    if (this.configurationReportQueues.get(controllerId) === queue) this.configurationReportQueues.delete(controllerId);
  }
}
