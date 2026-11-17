import type { StoredDashboardPin } from '@attraccess/application-models';
import type { TransactionScope } from '../database/unit-of-work';

export const DASHBOARD_PIN_STORE = Symbol.for('attraccess.dashboard.pin-store');

/** Persistence of the personal dashboard pins and the resource facts the dashboard needs. */
export interface DashboardPinStore {
  /** The user's pins in their stored order. */
  listPins(userId: number, scope?: TransactionScope): Promise<StoredDashboardPin[]>;

  /**
   * The user's pins in their stored order, read inside a unit of work such that concurrent writers of the same
   * user's list wait for each other: no other writer can change the list between this read and the replacement.
   */
  listPinsForUpdate(userId: number, scope: TransactionScope): Promise<StoredDashboardPin[]>;

  /** Stores the list in the given order, replacing the user's current one. */
  replacePins(userId: number, pins: StoredDashboardPin[], scope: TransactionScope): Promise<void>;

  /** Deletes the user's pins of these resources. */
  deleteResourcePins(userId: number, resourceIds: string[], scope: TransactionScope): Promise<void>;

  /** The names of those of the resources that still exist (not deleted), by resource id. */
  resourceNames(resourceIds: number[]): Promise<Map<number, string>>;

  resourceExists(resourceId: number): Promise<boolean>;
}
