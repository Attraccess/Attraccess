import { Resource } from './resource';

export interface ResourceOperatingInterval {
  id: number;
  resourceId: number;
  startTime: Date;
  endTime: Date | null;
  startFlowNodeId: string | null;
  startFlowRunId: string | null;
  endFlowNodeId: string | null;
  endFlowRunId: string | null;
  createdAt: Date;
  resource: Resource;
}
