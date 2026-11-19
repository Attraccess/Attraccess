import type { ResourcePersistenceContext } from '../resource-persistence-context';

export const RESOURCE_RETRAINING_STORE = Symbol.for('attraccess.resources.retraining-store');

/** The retraining rule of a resource or group and the user's last use of it. */
export interface RetrainingTarget {
  id: number;
  name: string;
  retrainingMaxAgeDays: number | null;
  retrainingMaxInactivityDays: number | null;
  retrainingBlocksAccess: boolean;
}

export interface RetrainingStore {
  findResourceTarget(resourceId: number, context?: ResourcePersistenceContext): Promise<RetrainingTarget | null>;

  findGroupTarget(groupId: number, context?: ResourcePersistenceContext): Promise<RetrainingTarget | null>;

  /** When the user last ended a usage of the resource. */
  lastResourceUseAt(resourceId: number, userId: number, context?: ResourcePersistenceContext): Promise<Date | null>;

  /** When the user last ended a usage of any resource of the group. */
  lastGroupUseAt(groupId: number, userId: number, context?: ResourcePersistenceContext): Promise<Date | null>;
}
