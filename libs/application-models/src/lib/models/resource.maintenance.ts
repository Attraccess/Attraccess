import { Resource } from './resource';
import { User } from './user';
import { ResourceMaintenanceSchedule } from './resource-maintenance-schedule';

export interface ResourceMaintenance {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  resourceId: number;
  resource: Resource;
  startTime: Date;
  endTime: Date | null;
  reason: string | null;
  createdByUser: User | null;
  completedByUser: User | null;
  completedAt: Date | null;
  maintenanceSchedule: ResourceMaintenanceSchedule | null;
}
