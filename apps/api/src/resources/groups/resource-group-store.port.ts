import type {
  ResourceGroupRecord,
  ResourceIntroducerRecord,
  ResourceIntroducerType,
} from '@attraccess/application-models';
import type { ResourcePersistenceContext } from '../resource-persistence-context';

export const RESOURCE_GROUP_STORE = Symbol.for('attraccess.resources.group-store');
export const RESOURCE_GROUP_INTRODUCER_STORE = Symbol.for('attraccess.resources.group-introducer-store');

/** A group, with the ids of its resources when the read asked for them. */
export type ResourceGroupDetail = ResourceGroupRecord & { resources?: Array<{ id: number }> };

/**
 * Who may see hidden groups: managers, and users that are part of the group. With `permittedOnly` (machine-list
 * visibility "permitted-only", ATT-843) a non-manager also sees only groups that contain a machine they may see, or
 * that they are part of, and only machines they may see count as visible.
 */
export interface GroupVisibilityContext {
  userId: number;
  canUpdateResources: boolean;
  permittedOnly?: boolean;
}

export interface NewResourceGroup {
  name: string;
  description?: string | null;
  retrainingMaxAgeDays: number | null;
  retrainingMaxInactivityDays: number | null;
  retrainingBlocksAccess: boolean;
  isHidden: boolean;
}

export type ResourceGroupPatch = Pick<
  ResourceGroupRecord,
  | 'name'
  | 'description'
  | 'retrainingMaxAgeDays'
  | 'retrainingMaxInactivityDays'
  | 'retrainingBlocksAccess'
  | 'isHidden'
>;

/** Resource groups and their membership. */
export interface ResourceGroupStore {
  /** The groups the visibility context may see (all of them without one, or for managers). */
  listVisible(visibility?: GroupVisibilityContext): Promise<ResourceGroupRecord[]>;

  /** Whether the visibility context may see this group (hidden-group and permitted-only rules). */
  isVisible(groupId: number, visibility: GroupVisibilityContext): Promise<boolean>;

  /** Whether the visibility context may see at least one resource (ungrouped, or in a visible group). */
  hasVisibleResources(visibility: GroupVisibilityContext): Promise<boolean>;

  findById(groupId: number, withResources?: boolean): Promise<ResourceGroupDetail | null>;

  create(group: NewResourceGroup): Promise<ResourceGroupRecord>;

  update(groupId: number, patch: ResourceGroupPatch): Promise<ResourceGroupRecord>;

  /**
   * The number of deleted groups (0 when it does not exist). Live group forms must be deleted softly first, in the same
   * unit of work (`ResourceFormStore.softDeleteGroupForms`): the group FK then sets their groupId to NULL.
   */
  delete(groupId: number, context?: ResourcePersistenceContext): Promise<number>;

  /** An introducer or maintainer grant on the group, or an introduction whose latest history item is a GRANT. */
  userIsPartOfGroup(groupId: number, userId: number): Promise<boolean>;

  resourceExists(resourceId: number): Promise<boolean>;

  addResource(groupId: number, resourceId: number): Promise<void>;

  removeResource(groupId: number, resourceId: number): Promise<void>;

  groupsOfResource(resourceId: number, context?: ResourcePersistenceContext): Promise<ResourceGroupRecord[]>;
}

/** Introducer and maintainer grants on resource groups. */
export interface ResourceGroupIntroducerStore {
  /** Grants on the group with their users. */
  list(groupId: number): Promise<ResourceIntroducerRecord[]>;

  find(groupId: number, userId: number, type?: ResourceIntroducerType): Promise<ResourceIntroducerRecord | null>;

  insert(groupId: number, userId: number, type: ResourceIntroducerType): Promise<ResourceIntroducerRecord>;

  remove(grantId: number): Promise<void>;
}
