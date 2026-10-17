import type {
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  IntroductionHistoryAction,
} from '@attraccess/application-models';
import { operationToken } from '../../../database/transaction-scope';
export interface IntroductionSubject {
  kind: 'resource' | 'group';
  id: number;
}
export interface NewIntroductionHistory {
  introduction: Pick<ResourceIntroduction, 'id'> | ResourceIntroduction;
  action: IntroductionHistoryAction;
  performedByUserId: number;
  comment?: string;
}
export abstract class IntroductionPersistence {
  abstract find(subject: IntroductionSubject, userId: number): Promise<ResourceIntroduction | null>;
  abstract latest(introductionId: number): Promise<ResourceIntroductionHistoryItem | null>;
  abstract list(subject: IntroductionSubject, includeGroups?: boolean): Promise<ResourceIntroduction[]>;
  abstract history(subject: IntroductionSubject, userId: number): Promise<ResourceIntroductionHistoryItem[]>;
  abstract create(subject: IntroductionSubject, userId: number, tutorUserId?: number): Promise<ResourceIntroduction>;
  abstract setTutor(introductionId: number, tutorUserId: number): Promise<void>;
  abstract appendHistory(data: NewIntroductionHistory): Promise<ResourceIntroductionHistoryItem>;
}
export const INTRODUCTION_OPERATION_METHODS = [
  'find',
  'latest',
  'list',
  'history',
  'create',
  'setTutor',
  'appendHistory',
] as const;
export const INTRODUCTION_OPERATIONS = operationToken<IntroductionPersistence>(
  'resource introductions',
  INTRODUCTION_OPERATION_METHODS,
);
