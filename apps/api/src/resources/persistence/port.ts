import type { Resource } from '@attraccess/application-models';
export interface ResourceSessionState {
  endTime: Date | null;
  lifecyclePending: boolean;
}
export abstract class ResourceEventPersistence {
  abstract exists(resourceId: number): Promise<boolean>;
  abstract existingIds(ids: readonly number[]): Promise<number[]>;
  abstract sessionStates(resourceId: number): Promise<ResourceSessionState[]>;
}

export interface ResourceCatalogPage {
  page: number;
  limit: number;
  search?: string;
  groupId?: number;
  ids?: readonly number[];
  onlyInUseByUserId?: number;
  onlyWithPermissionForUserId?: number;
  onlyInUse?: boolean;
  returnUsingUser?: boolean;
}
export type NewResource = Pick<
  Resource,
  | 'name'
  | 'description'
  | 'documentationType'
  | 'documentationMarkdown'
  | 'documentationUrl'
  | 'allowTakeOver'
  | 'type'
  | 'separateUnlockAndUnlatch'
  | 'metadata'
  | 'retrainingMaxAgeDays'
  | 'retrainingMaxInactivityDays'
  | 'retrainingBlocksAccess'
  | 'supervisionMode'
  | 'supervisedUsagesUntilIntroduction'
  | 'autoIntroductionTarget'
  | 'autoIntroductionGroupId'
>;
export abstract class ResourceCatalogPersistence {
  abstract resourcesByIds(ids: readonly number[]): Promise<Resource[]>;
  abstract catalogPage(options: ResourceCatalogPage): Promise<[Resource[], number]>;
  abstract resourceCount(): Promise<number>;
  abstract createResource(resource: NewResource): Promise<Resource>;
  abstract saveResource(resource: Resource): Promise<Resource>;
  abstract removeResource(id: number): Promise<void>;
  abstract softDeleteResource(id: number): Promise<boolean>;
}
