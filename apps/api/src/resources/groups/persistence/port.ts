import { IntroductionPersistence, INTRODUCTION_OPERATION_METHODS } from '../../introductions/persistence/port';
import { operationToken } from '../../../database/transaction-scope';
import type {
  ResourceIntroducer,
  ResourceIntroducerType,
  ResourceGroup,
  Resource,
} from '@attraccess/application-models';
export abstract class GroupIntroducerPersistence {
  abstract grants(groupId: number): Promise<ResourceIntroducer[]>;
  abstract grant(groupId: number, userId: number, type?: ResourceIntroducerType): Promise<ResourceIntroducer | null>;
  abstract createGrant(groupId: number, userId: number, type: ResourceIntroducerType): Promise<ResourceIntroducer>;
  abstract removeGrant(grant: ResourceIntroducer): Promise<ResourceIntroducer>;
}

export abstract class GroupPersistence {
  abstract visibleGroups(userId?: number): Promise<ResourceGroup[]>;
  abstract hasVisibleResources(userId?: number): Promise<boolean>;
  abstract group(id: number, withResources: boolean): Promise<ResourceGroup | null>;
  abstract resource(id: number): Promise<Resource | null>;
  abstract createGroup(data: Partial<ResourceGroup>): Promise<ResourceGroup>;
  abstract saveGroup(data: Partial<ResourceGroup>): Promise<ResourceGroup>;
  abstract deleteGroup(id: number): Promise<number>;
  abstract introducerCount(groupId: number, userId: number): Promise<number>;
  abstract hasActiveIntroduction(groupId: number, userId: number): Promise<boolean>;
  abstract groupsOfResource(resourceId: number): Promise<ResourceGroup[]>;
}
export const GROUP_OPERATIONS = operationToken<GroupPersistence>('resource groups', [
  'visibleGroups',
  'hasVisibleResources',
  'group',
  'resource',
  'createGroup',
  'saveGroup',
  'deleteGroup',
  'introducerCount',
  'hasActiveIntroduction',
  'groupsOfResource',
]);

export abstract class GroupIntroductionPersistence extends IntroductionPersistence {}
export const GROUP_INTRODUCTION_OPERATIONS = operationToken<GroupIntroductionPersistence>(
  'group introductions',
  INTRODUCTION_OPERATION_METHODS,
);
