import { ResourceIntroduction } from './resourceIntroduction';
import { User } from './user';

export enum IntroductionHistoryAction {
  REVOKE = 'revoke',
  GRANT = 'grant',
}

export interface ResourceIntroductionHistoryItem {
  id: number;
  introductionId: number;
  action: IntroductionHistoryAction;
  performedByUserId: number;
  comment: string | null;
  createdAt: Date;
  introduction: ResourceIntroduction;
  performedByUser: User;
}
