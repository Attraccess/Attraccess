import { Resource } from './resource';

export interface ResourceFlowEdge {
  id: string;
  source: string;
  sourceHandle: string | null;
  target: string;
  targetHandle: string | null;
  createdAt: Date;
  updatedAt: Date;
  resourceId: number;
  resource: Resource;
}
