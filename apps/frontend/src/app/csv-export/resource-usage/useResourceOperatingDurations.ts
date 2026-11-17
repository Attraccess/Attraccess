import { AnalyticsService } from '@attraccess/react-query-client';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  attributedDurationByResourceAndUsage,
  mergeOperatingDurationSummaries,
  operatingDurationWindows,
} from './operating-duration';
import type { OperatingDurationSummary } from './operating-duration';

const RESOURCE_IDS_PER_OPERATING_DURATION_REQUEST = 100;

/** Loads the operating durations of the exported resources (in batches) and the per-usage attribution derived from them. */
export function useResourceOperatingDurations(resourceIds: number[], start: Date, end: Date, enabled: boolean) {
  const operatingDurationRanges = useMemo(() => operatingDurationWindows(start, end), [start, end]);
  const { data: operatingDurations, status: operatingDurationsStatus } = useQuery({
    queryKey: ['resource-operating-durations', resourceIds, start, end],
    queryFn: async ({ signal }) => {
      const operatingDurations: Record<number, OperatingDurationSummary> = {};
      for (let index = 0; index < resourceIds.length; index += RESOURCE_IDS_PER_OPERATING_DURATION_REQUEST) {
        for (const range of operatingDurationRanges) {
          signal.throwIfAborted();
          const request = AnalyticsService.getResourceOperatingDurations({
            requestBody: {
              resourceIds: resourceIds.slice(index, index + RESOURCE_IDS_PER_OPERATING_DURATION_REQUEST),
              start: range.start.toISOString(),
              end: range.end.toISOString(),
            },
          });
          const cancelRequest = () => request.cancel();
          signal.addEventListener('abort', cancelRequest, { once: true });
          try {
            mergeOperatingDurationSummaries(
              operatingDurations,
              (await request) as Record<number, OperatingDurationSummary>,
            );
          } finally {
            signal.removeEventListener('abort', cancelRequest);
          }
        }
      }
      return operatingDurations;
    },
    enabled: resourceIds.length > 0 && enabled,
    // refocusing the tab must not re-request the durations of every loaded resource
    refetchOnWindowFocus: false,
  });
  const attributedDurations = useMemo(
    () => attributedDurationByResourceAndUsage(operatingDurations),
    [operatingDurations],
  );

  return { operatingDurations, operatingDurationsStatus, attributedDurations };
}
