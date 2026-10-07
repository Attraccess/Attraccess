import { ResourceUsage } from '@attraccess/react-query-client';

export function durationMsForSession(item: ResourceUsage, asOf: Date): number {
  const now = new Date();
  const end = Math.min(new Date(item.endTime ?? now).getTime(), asOf.getTime(), now.getTime());
  return end - new Date(item.startTime).getTime();
}
