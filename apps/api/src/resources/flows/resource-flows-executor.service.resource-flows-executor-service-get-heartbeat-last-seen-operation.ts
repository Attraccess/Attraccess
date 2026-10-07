import { heartbeatKey } from './node-executors';
import { ResourceFlowsExecutorServiceTrackResourceActivityOperation } from './resource-flows-executor.service.resource-flows-executor-service-track-resource-activity-operation';
export abstract class ResourceFlowsExecutorServiceGetHeartbeatLastSeenOperation extends ResourceFlowsExecutorServiceTrackResourceActivityOperation {
  public getHeartbeatLastSeen(resourceId: number, identifier: string): Date | undefined {
    return this.heartbeatLastSeen.get(heartbeatKey(resourceId, identifier));
  }
}
