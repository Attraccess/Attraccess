import { Resource } from './resource';
import { User } from './user';
import { ResourceMaintenance } from './resource.maintenance';

export enum MaintenanceRequestStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export interface ResourceMaintenanceRequest {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  resourceId: number;
  resource: Resource;
  reason: string;
  status: MaintenanceRequestStatus;
  createdByUser: User | null;
  resolvedByUser: User | null;
  resolvedAt: Date | null;
  resultingMaintenance: ResourceMaintenance | null;
}
