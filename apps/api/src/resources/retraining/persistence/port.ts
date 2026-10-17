import type {
  Resource,
  ResourceGroup,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  IntroductionHistoryAction,
} from '@attraccess/application-models';
export abstract class ResourceRetrainingPersistence {
  abstract introduction(id: number): Promise<ResourceIntroduction | null>;
  abstract resourceIntroduction(resourceId: number, userId: number): Promise<ResourceIntroduction | null>;
  abstract groupIntroduction(groupId: number, userId: number): Promise<ResourceIntroduction | null>;
  abstract resource(id: number): Promise<Resource | null>;
  abstract group(id: number): Promise<ResourceGroup | null>;
  abstract groupWithResources(id: number): Promise<ResourceGroup | null>;
  abstract latestHistory(
    introductionId: number,
    action?: IntroductionHistoryAction,
  ): Promise<ResourceIntroductionHistoryItem | null>;
  abstract resourceLastUsedAt(resourceId: number, userId: number): Promise<Date | null>;
  abstract resourcesLastUsedAt(resourceIds: readonly number[], userId: number): Promise<Date | null>;
  abstract configuredIntroductions(): Promise<ResourceIntroduction[]>;
  abstract stampRequiredAudit(id: number, at: Date): Promise<void>;
  abstract stampNotification(id: number, at: Date): Promise<void>;
}
