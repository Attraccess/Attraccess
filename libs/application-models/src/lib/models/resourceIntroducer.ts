import { Resource } from './resource';
import { User } from './user';
import { ResourceGroup } from './resourceGroup';

export enum ResourceIntroducerType {
  INTRODUCER = 'introducer',
  MAINTAINER = 'maintainer',
}

export interface ResourceIntroducer {
  id: number;
  type: ResourceIntroducerType;
  resourceId: number | null;
  userId: number;
  resourceGroupId: number | null;
  grantedAt: Date;
  resource: Resource | null;
  user: User;
  resourceGroup: ResourceGroup | null;
}
