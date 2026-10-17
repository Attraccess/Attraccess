import { Resource } from './resource';
import { User } from './user';
import { ResourceIntroductionHistoryItem } from './resourceIntroductionHistoryItem';
import { ResourceGroup } from './resourceGroup';

export interface ResourceIntroduction {
  id: number;
  resourceId: number | null;
  receiverUserId: number;
  tutorUserId: number;
  resourceGroupId: number | null;
  completedAt: Date;
  retrainingNotifiedAt: Date | null;
  retrainingRequiredAuditedAt: Date | null;
  createdAt: Date;
  resource: Resource;
  receiverUser: User;
  tutorUser: User;
  history: ResourceIntroductionHistoryItem[];
  resourceGroup: ResourceGroup;
}
