import type { ResourceUsageAction } from '@attraccess/application-models';
import type { DateRangeValue } from './dtos/dateRangeValue';

/**
 * One usage session of the export, as the JSON of the export endpoint carries it: the session with its user,
 * resource and supervisor, and the flat email fields the export adds. The adapter owns the exact shape.
 */
export interface ResourceUsageExportRow {
  id: number;
  userEmail: string | null;
  supervisorEmail: string | null;
  [field: string]: unknown;
}

/** One billing transaction of the export with its parties, usage and items, plus the gated email fields. */
export interface BillingTransactionExportRow {
  id: number;
  userEmail: string | null;
  initiatorEmail: string | null;
  [field: string]: unknown;
}

export interface ResourceHoursRangeParams {
  start: Date;
  asOf: Date;
  action: ResourceUsageAction;
  pending: boolean;
}

export interface ResourceInRange {
  id: number;
  name: string;
  metadata: Record<string, unknown> | null;
}

/** Reads of the reporting queries. The adapter owns the query shapes, joins and engine specific SQL. */
export const ANALYTICS_READER = Symbol.for('attraccess.analytics.reader');

export interface AnalyticsReader {
  /** Finished-lifecycle usage sessions that started in the range, newest first, one page. */
  findUsagesStartedInRange(
    range: DateRangeValue,
    page: number,
    limit: number,
  ): Promise<{ rows: ResourceUsageExportRow[]; total: number }>;
  /** Billing transactions created in the range, newest first, one page. Emails are filled only on request. */
  findBillingTransactionsInRange(
    range: DateRangeValue,
    page: number,
    limit: number,
    includeEmail: boolean,
  ): Promise<{ rows: BillingTransactionExportRow[]; total: number }>;
  /**
   * Resources (deleted ones included, their history stays) with a usage session or operating interval overlapping
   * the range, ordered by id, one page.
   */
  findResourcesActiveInRange(
    params: ResourceHoursRangeParams,
    page: number,
    limit: number,
  ): Promise<{ resources: ResourceInRange[]; total: number }>;
  countSessionsInRange(resourceIds: number[], params: ResourceHoursRangeParams): Promise<Map<number, number>>;
  /** Where the first session or operating interval of these resources overlapping [start, asOf) begins. */
  findFirstActivityStart(resourceIds: number[], start: Date, asOf: Date): Promise<Date | null>;
}
