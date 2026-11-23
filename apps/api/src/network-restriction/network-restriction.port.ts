import type { NetworkRestrictedAction } from '@attraccess/application-models';

/** Persistence of which actions each role may perform from outside the allowed network. */
export const NETWORK_RESTRICTION_STORE = Symbol.for('attraccess.network-restriction.store');

export interface RoleNetworkActionsRecord {
  roleId: number;
  actions: NetworkRestrictedAction[];
}

export interface NetworkRestrictionStore {
  /** Every role with the actions it allows from outside; roles without entries come back with an empty list. */
  listRoleActions(): Promise<Array<RoleNetworkActionsRecord & { key: string; name: string }>>;
  /** The actions that any role of the user allows from outside (the union). */
  actionsAllowedForUser(userId: number): Promise<NetworkRestrictedAction[]>;
  /** Replaces the action set of each given role in one transaction. Throws when a role does not exist. */
  replaceRoleActions(entries: RoleNetworkActionsRecord[]): Promise<void>;
  /** The ids that are roles. */
  existingRoleIds(roleIds: number[]): Promise<number[]>;
}
