import type { ResourceActorUser } from './resource-actor-user';
import type { ResourceIntroducerType } from './resourceIntroducer';

/** A grant that makes a user introducer or maintainer of a resource or of a resource group. */
export interface ResourceIntroducerRecord {
  id: number;
  type: ResourceIntroducerType;
  resourceId: number | null;
  userId: number;
  resourceGroupId: number | null;
  grantedAt: Date;
  /** Present when the read asked for the granted user. */
  user?: ResourceActorUser | null;
}
