import { Button, Skeleton } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PlusIcon } from 'lucide-react';
import { useMemo } from 'react';
import {
  ResourceMaintenance,
  useResourceMaintenancesServiceFindMaintenances,
} from '@attraccess/react-query-client';
import { useNow } from '../../../../hooks/useNow';
import { ResourceMaintenanceUpsertModal } from '../maintenance-management/upsert';
import { LiveSection } from './live-section';
import { UpcomingSection } from './upcoming-section';
import { HistorySection } from './history-section';
import de from './de.json';
import en from './en.json';

interface Props {
  resourceId: number;
}

export function ActivityTab(props: Props) {
  const { resourceId } = props;
  const { t } = useTranslations({ de, en });
  const now = useNow();

  const { data, isLoading } = useResourceMaintenancesServiceFindMaintenances(
    { resourceId, includePast: true, includeActive: true, includeUpcoming: true },
    undefined,
    { refetchInterval: 10_000 },
  );

  const partitioned = useMemo(() => {
    const all = data?.data ?? [];
    const live: ResourceMaintenance[] = [];
    const upcoming: ResourceMaintenance[] = [];
    const past: ResourceMaintenance[] = [];
    for (const m of all) {
      const start = new Date(m.startTime);
      const end = m.endTime ? new Date(m.endTime) : null;
      if (start <= now && (!end || end > now)) live.push(m);
      else if (start > now) upcoming.push(m);
      else past.push(m);
    }
    upcoming.sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
    past.sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime));
    return { live, upcoming, past };
  }, [data?.data, now]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <ResourceMaintenanceUpsertModal resourceId={resourceId}>
          {(open) => (
            <Button variant="primary" onPress={open}>
              <PlusIcon className="w-4 h-4" />
              {t('activity.actions.create')}
            </Button>
          )}
        </ResourceMaintenanceUpsertModal>
      </div>

      <LiveSection resourceId={resourceId} liveMaintenances={partitioned.live} />
      <UpcomingSection upcomingMaintenances={partitioned.upcoming} />
      <HistorySection pastMaintenances={partitioned.past} />
    </div>
  );
}
