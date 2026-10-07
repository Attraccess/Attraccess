import { TFunction } from '@attraccess/plugins-frontend-ui';
import { PeopleTarget } from './types';
import { ResourceIntroducerType } from '@attraccess/react-query-client';

export interface Params {
  target: PeopleTarget;
  t: TFunction;
}

export interface PeopleMutations {
  grantIntroducer: (userId: number) => Promise<void>;
  grantMaintainer: (userId: number) => Promise<void>;
  revokeIntroducer: (userId: number, type: ResourceIntroducerType) => Promise<void>;
  grantIntroduction: (userId: number, comment?: string) => Promise<void>;
  revokeIntroduction: (userId: number, comment?: string) => Promise<void>;
  pendingIntroducer: { userId: number; type: ResourceIntroducerType } | null;
  pendingIntroductionUserId: number | null;
  isGrantingIntroducer: boolean;
  isRevokingIntroducer: boolean;
  isGrantingIntroduction: boolean;
  isRevokingIntroduction: boolean;
  isMutating: boolean;
}
