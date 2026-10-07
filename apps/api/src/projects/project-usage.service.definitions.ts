export type UsageSummaryRaw = {
  totalSessions: string | null;
  totalMinutes: string | null;
};
export type SpendRaw = {
  totalSpend: string | null;
};
export type TimeSeriesUsageRaw = {
  usageDate: string;
  sessions: string;
  minutes: string;
};
export type TimeSeriesSpendRaw = {
  usageDate: string;
  spend: string;
};
export type ResourceUsageAggregateRaw = {
  resourceId: string;
  resourceName: string | null;
  sessions: string;
  minutes: string;
};
export type ResourceSpendAggregateRaw = {
  resourceId: string;
  spend: string;
};
