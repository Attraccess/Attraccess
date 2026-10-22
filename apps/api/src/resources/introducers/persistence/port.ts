import type { ResourceIntroducer, ResourceIntroducerType, User } from '@attraccess/application-models';
import { operationToken } from '../../../database/transaction-scope';
export interface InheritedResourceGrant {
  resourceId: number;
  grant: ResourceIntroducer;
}
export abstract class ResourceIntroducerPersistence {
  abstract directGrants(resourceIds: readonly number[], type?: ResourceIntroducerType): Promise<ResourceIntroducer[]>;
  abstract groupGrants(resourceId: number, type?: ResourceIntroducerType): Promise<ResourceIntroducer[]>;
  abstract inheritedGrants(
    resourceIds: readonly number[],
    type?: ResourceIntroducerType,
  ): Promise<InheritedResourceGrant[]>;
  abstract directGrant(
    resourceId: number,
    userId: number,
    type?: ResourceIntroducerType,
  ): Promise<ResourceIntroducer | null>;
  abstract hasGroupGrant(resourceId: number, userId: number, type: ResourceIntroducerType | null): Promise<boolean>;
  abstract recipient(userId: number): Promise<Pick<User, 'id' | 'locale'> | null>;
  abstract createGrant(resourceId: number, userId: number, type: ResourceIntroducerType): Promise<ResourceIntroducer>;
  abstract removeGrant(grant: ResourceIntroducer): Promise<void>;
}
export const RESOURCE_INTRODUCER_OPERATIONS = operationToken<ResourceIntroducerPersistence>('resource introducers', [
  'directGrants',
  'groupGrants',
  'inheritedGrants',
  'directGrant',
  'hasGroupGrant',
  'recipient',
  'createGrant',
  'removeGrant',
]);
