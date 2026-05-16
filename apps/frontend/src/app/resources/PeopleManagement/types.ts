import { ResourceIntroducer, ResourceIntroduction, User } from '@attraccess/react-query-client';

export type AddMode = 'introducer' | 'introduction';
export type FilterMode = 'all' | 'introducers' | 'introduced';

export interface PersonRow {
  user: User;
  isIntroducer: boolean;
  introducer: ResourceIntroducer | null;
  introduction: ResourceIntroduction | null;
  hasValidIntroduction: boolean;
  introductionLastEventAt: string | null;
  activityAt: string;
}

export interface PeopleManagementProps {
  resourceId: number;
  canManageIntroducers: boolean;
  canManageIntroductions: boolean;
}
