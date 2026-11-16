import type {
  MaintenanceRequestStatus,
  ResourceMaintenanceRequestRecord,
  ResourceNotificationRecipient,
} from '@attraccess/application-models';

export const MAINTENANCE_REQUEST_STORE = Symbol.for('attraccess.resources.maintenance-request-store');

export interface MaintenanceRequestResolution {
  status: MaintenanceRequestStatus;
  resolvedByUserId: number;
  resolvedAt: Date;
  /** Set when the request was converted into a maintenance. */
  resultingMaintenanceId?: number;
}

/** Requests that users file to report a resource as needing maintenance. */
export interface MaintenanceRequestStore {
  resourceExists(resourceId: number): Promise<boolean>;

  create(resourceId: number, createdByUserId: number, reason: string): Promise<ResourceMaintenanceRequestRecord>;

  /** Newest first, with the users and the resulting maintenance. */
  page(
    resourceId: number,
    status: MaintenanceRequestStatus,
    skip: number,
    take: number,
  ): Promise<{ data: ResourceMaintenanceRequestRecord[]; total: number }>;

  findById(requestId: number): Promise<ResourceMaintenanceRequestRecord | null>;

  resolve(requestId: number, resolution: MaintenanceRequestResolution): Promise<ResourceMaintenanceRequestRecord>;
}

export const MAINTENANCE_NOTIFICATION_STORE = Symbol.for('attraccess.resources.maintenance-notification-store');

export interface RequestForNotification {
  id: number;
  reason: string;
  createdByUsername: string | null;
}

/** What the maintenance request notification needs to know about the request, the resource and the recipients. */
export interface MaintenanceNotificationStore {
  findRequest(requestId: number): Promise<RequestForNotification | null>;

  findResource(resourceId: number): Promise<{ id: number; name: string; groupIds: number[] } | null>;

  findUsersByIds(userIds: number[]): Promise<ResourceNotificationRecipient[]>;

  /** The users holding an introducer or maintainer grant on the resource or on one of the groups. */
  findIntroducerUsers(resourceId: number, groupIds: number[]): Promise<ResourceNotificationRecipient[]>;
}
