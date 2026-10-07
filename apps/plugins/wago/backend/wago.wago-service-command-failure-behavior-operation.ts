import { WagoServiceManualCommandOperation } from './wago.wago-service-manual-command-operation';


export abstract class WagoServiceCommandFailureBehaviorOperation extends WagoServiceManualCommandOperation {
  commandFailureBehavior(config: Record<string, unknown>) {
    return ['fail-flow', 'failure-output', 'log-and-continue'].includes(config.failureBehavior as string)
      ? (config.failureBehavior as 'fail-flow' | 'failure-output' | 'log-and-continue')
      : 'fail-flow';
  }
}
