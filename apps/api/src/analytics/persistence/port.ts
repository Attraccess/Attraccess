import type { BillingTransaction, ResourceUsage } from '@attraccess/application-models';

export interface ReportPage {
  start: Date;
  end: Date;
  page: number;
  limit: number;
}
export abstract class AnalyticsPersistence {
  /** Existing report visibility: usage actions, excluding pending lifecycle candidates. */
  abstract usageReportPage(input: ReportPage): Promise<[ResourceUsage[], number]>;
  abstract billingReportPage(input: ReportPage): Promise<[BillingTransaction[], number]>;
}
