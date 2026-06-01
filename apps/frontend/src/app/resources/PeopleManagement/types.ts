import { ResourceIntroducer, ResourceIntroducerType, ResourceIntroduction, User } from '@attraccess/react-query-client';

export type AddMode = 'introducer' | 'introduction' | 'maintainer';
export type FilterMode = 'all' | 'introducers' | 'maintainers' | 'introduced';

export type PeopleTarget = { type: 'resource'; id: number } | { type: 'group'; id: number };

export interface PersonRow {
  user: User;
  isIntroducer: boolean;
  isMaintainer: boolean;
  introducerType: ResourceIntroducerType | null;
  introducer: ResourceIntroducer | null;
  introduction: ResourceIntroduction | null;
  hasValidIntroduction: boolean;
  introductionLastEventAt: string | null;
  activityAt: string;
}

export interface PeopleManagementProps {
  target: PeopleTarget;
  canManageIntroducers: boolean;
  canManageIntroductions: boolean;
  flat?: boolean;
  hideHeader?: boolean;
}
