import { ResourceFlowsExecutorServiceRunFlowOperation } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-operation';
export abstract class ResourceFlowsExecutorServiceTrackResourceActivityOperation extends ResourceFlowsExecutorServiceRunFlowOperation {
  public trackResourceActivity(resourceId: number) {
    this.resourceActivity.set(resourceId, new Date());
  }
}
