export const MASS_INTRODUCTION_TARGET_STORE = Symbol.for('attraccess.resources.mass-introduction-target-store');

/** What a mass introduction needs to know about the resource or group it introduces people to. */
export interface MassIntroductionTargetStore {
  findResourceName(resourceId: number): Promise<{ id: number; name: string } | null>;

  findGroupName(groupId: number): Promise<{ id: number; name: string } | null>;

  /** The ids of the resources that belong to the group. */
  resourceIdsOfGroup(groupId: number): Promise<number[]>;
}
