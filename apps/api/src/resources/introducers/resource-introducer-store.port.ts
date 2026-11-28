import type { ResourceIntroducerRecord, ResourceIntroducerType } from '@attraccess/application-models';
import type { ResourcePersistenceContext } from '../resource-persistence-context';

export const RESOURCE_INTRODUCER_STORE = Symbol.for('attraccess.resources.introducer-store');

/** Grants that make users introducers or maintainers of resources, directly or through resource groups. */
export interface ResourceIntroducerStore {
  /** The direct grant of the user on the resource (of this type, or of any type). */
  findDirect(
    resourceId: number,
    userId: number,
    type?: ResourceIntroducerType,
    context?: ResourcePersistenceContext,
  ): Promise<ResourceIntroducerRecord | null>;

  /** Whether one of the groups the resource belongs to grants the user (this type, or any type when null). */
  hasGroupGrant(
    resourceId: number,
    userId: number,
    type: ResourceIntroducerType | null,
    context?: ResourcePersistenceContext,
  ): Promise<boolean>;

  /** Direct grants of a resource with their users. */
  listDirect(resourceId: number, type?: ResourceIntroducerType): Promise<ResourceIntroducerRecord[]>;

  /** Grants of the groups the resource belongs to, with their users. */
  listViaGroups(resourceId: number, type?: ResourceIntroducerType): Promise<ResourceIntroducerRecord[]>;

  /** Direct grants of several resources with their users. */
  listDirectForResources(resourceIds: number[], type?: ResourceIntroducerType): Promise<ResourceIntroducerRecord[]>;

  /** Group grants with the resource they reach, one row per (grant, resource), with their users. */
  listViaGroupsForResources(
    resourceIds: number[],
    type?: ResourceIntroducerType,
  ): Promise<Array<{ resourceId: number; grant: ResourceIntroducerRecord }>>;

  insert(resourceId: number, userId: number, type: ResourceIntroducerType): Promise<ResourceIntroducerRecord>;

  remove(grantId: number): Promise<void>;

  /** The resource's name, or null when it does not exist. */
  findResourceName(resourceId: number): Promise<string | null>;
}
