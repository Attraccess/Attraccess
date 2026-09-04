import { useQuery } from '@tanstack/react-query';
import {
  useAccessControlServiceResourceIntroducersIsIntroducer,
  useResourceMaintenancesServiceCanManageMaintenance,
} from '@attraccess/react-query-client';
import { useAuth } from '../../hooks/useAuth';
import { getBaseUrl } from '../../api';
import { useSSE } from '../../utils/sse';

export interface OperatingDurationSummary {
  sessionDurationMs: number;
  operatingDataAvailable: boolean;
  operatingDurationMs: number | null;
  unattributedOperatingDurationMs: number | null;
  isOperating: boolean;
  isProvisional: boolean;
  attributions: Array<{ usageId: number; durationMs: number }>;
}

interface OperatingDurationRange {
  start: Date;
  end: Date;
}

export function useCanViewOperatingDuration(resourceId: number) {
  const { hasPermission, user } = useAuth();
  const canManageResources = hasPermission('resources.update');
  const { data: introducer } = useAccessControlServiceResourceIntroducersIsIntroducer(
    { resourceId, userId: user?.id as number, includeGroups: true },
    undefined,
    { enabled: !!user?.id && !canManageResources },
  );
  const { data: maintenance } = useResourceMaintenancesServiceCanManageMaintenance({ resourceId }, undefined, {
    enabled: !!user?.id && !canManageResources,
  });
  return canManageResources || Boolean(introducer?.isIntroducer) || Boolean(maintenance?.canManage);
}

export function useOperatingDuration(resourceId: number, enabled: boolean, range?: OperatingDurationRange) {
  const query = useQuery({
    queryKey: ['resource-operating-attribution', resourceId, range?.start, range?.end],
    enabled,
    queryFn: async () => {
      const params = range && new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString() });
      const response = await fetch(`${getBaseUrl()}/api/resources/${resourceId}/operating-attribution${params ? `?${params}` : ''}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load operating duration');
      return response.json() as Promise<OperatingDurationSummary>;
    },
    refetchInterval: (query) => (!range && query.state.data?.isProvisional ? 5_000 : false),
  });

  useSSE({
    path: `/api/resources/${resourceId}/events`,
    onUpdate: () => query.refetch(),
    enabled: enabled && !range,
  });

  return query;
}
