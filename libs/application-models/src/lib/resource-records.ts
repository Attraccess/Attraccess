import type { DocumentationType } from './documentation-type';
import type { ResourceType } from './resource-type';
import type { AutoIntroductionTarget, SupervisionMode } from './resource-supervision';
import type { IntroductionRecord, ResourceGroupRecord } from './resource-introduction-records';
import type { UsageSession } from './usage-session';

/** A resource (machine or door) with the relations a read asked for. */
export interface ResourceRecord {
  id: number;
  name: string;
  type: ResourceType;
  separateUnlockAndUnlatch: boolean | null;
  description: string | null;
  imageFilename: string | null;
  documentationType: DocumentationType | null;
  documentationMarkdown: string | null;
  documentationUrl: string | null;
  metadata: Record<string, unknown> | null;
  allowTakeOver: boolean;
  maxParallelSessions: number;
  retrainingMaxAgeDays: number | null;
  retrainingMaxInactivityDays: number | null;
  retrainingBlocksAccess: boolean;
  supervisionMode: SupervisionMode;
  supervisedUsagesUntilIntroduction: number | null;
  autoIntroductionTarget: AutoIntroductionTarget | null;
  autoIntroductionGroupId: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  groups?: ResourceGroupRecord[];
  usages?: UsageSession[];
  introductions?: IntroductionRecord[];
}
