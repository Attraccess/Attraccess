import { ResourceUsageAction } from './resourceUsage-type';

/** One stretch in which a machine was operating, as recorded by the authoritative operating timeline. */
export interface OperatingIntervalRecord {
  id: number;
  resourceId: number;
  startTime: Date;
  /** `null` while the machine is still operating. */
  endTime: Date | null;
  startFlowNodeId: string | null;
  startFlowRunId: string | null;
  endFlowNodeId: string | null;
  endFlowRunId: string | null;
}

/** The part of a usage session the operating attribution needs. Sessions that did not start yet are never listed. */
export interface OperatingTimelineSession {
  id: number;
  resourceId: number;
  usageAction: ResourceUsageAction;
  lifecyclePending: boolean;
  startTime: Date;
  endTime: Date | null;
  operatingDurationCreditsPerMinute: number | null;
}

/** The segments a person was in with others, as shown on receipts (the shape stored on billing allocations). */
export interface OperatingBreakdownSegment {
  startedAt: string;
  endedAt: string;
  participants: number;
  totalQuantity: string;
  totalCredits: number;
  shareQuantity: string;
  shareCredits: number;
}
