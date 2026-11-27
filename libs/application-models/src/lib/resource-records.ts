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
  /** Doors only: the door's only action is Open, stored as a door unlock. */
  accessOnly: boolean;
  description: string | null;
  imageFilename: string | null;
  documentationType: DocumentationType | null;
  documentationMarkdown: string | null;
  documentationUrl: string | null;
  metadata: Record<string, unknown> | null;
  allowTakeOver: boolean;
  /** Whether ending one's own session first asks "Is the machine OK?" (web and readers; not enforced). */
  askMaintenanceCheckOnSessionEnd: boolean;
  maxParallelSessions: number;
  /** Longest a session may run, in minutes; null means no limit. Machines only. */
  maxSessionDurationMinutes: number | null;
  /** Whether a start has to state how long the machine will be used. Machines only. */
  requireSessionDurationEstimate: boolean;
  /** The estimate for starts that cannot ask, when one is required and there is no maximum; null means 60. */
  defaultSessionDurationEstimateMinutes: number | null;
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
