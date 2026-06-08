import { useParams, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { PlusIcon, ArrowLeft, CalendarClockIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ResourceMaintenance,
  useResourceMaintenancesServiceCanManageMaintenance,
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedules,
  useResourceMaintenancesServiceFindMaintenances,
  useResourcesServiceGetOneResourceById,
} from '@attraccess/react-query-client';
import { useNow } from '../../../../hooks/useNow';
import { StatStrip } from './stat-strip';
import { SchedulesTab } from './schedules-tab';
import { RequestsSection } from './requests-section';
import { LiveSection } from './live-section';
import { UpcomingSection } from './upcoming-section';
import { HistorySection } from './history-section';
import { ScheduleFormDrawer } from './schedule-form-drawer';
import { ResourceMaintenanceUpsertModal } from '../maintenance-management/upsert';
import de from './de.json';
import en from './en.json';

export function MaintenanceHubPage() {
  const { id } = useParams<{ id: string }>();
  const resourceId = parseInt(id || '', 10);
  const navigate = useNavigate();
  const { t } = useTranslations({ de, en });

  const now = useNow();

  const { data: resource, isLoading: isLoadingResource, error: resourceError } =
    useResourcesServiceGetOneResourceById({ id: resourceId });

  const { data: permissions, isLoading: isLoadingPerms } =
    useResourceMaintenancesServiceCanManageMaintenance({ resourceId });

  const { data: schedules, isLoading: isLoadingSchedules } =
    useResourceMaintenanceSchedulesServiceFindMaintenanceSchedules({ resourceId });

  const { data: maintenancesEnvelope, isLoading: isLoadingMaintenances } =
    useResourceMaintenancesServiceFindMaintenances(
      { resourceId, includePast: true, includeActive: true, includeUpcoming: true },
      undefined,
      { refetchInterval: 10_000 },
    );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerScheduleId, setDrawerScheduleId] = useState<number | undefined>(undefined);

  const openCreateDrawer = () => { setDrawerScheduleId(undefined); setDrawerOpen(true); };
  const openEditDrawer = (id: number) => { setDrawerScheduleId(id); setDrawerOpen(true); };
  const closeDrawer = () => setDrawerOpen(false);

  const partitioned = useMemo(() => {
    const live: ResourceMaintenance[] = [];
    const upcoming: ResourceMaintenance[] = [];
    const past: ResourceMaintenance[] = [];
    for (const m of maintenancesEnvelope?.data ?? []) {
      const start = new Date(m.startTime);
      const end = m.endTime ? new Date(m.endTime) : null;
      if (start <= now && (!end || end > now)) live.push(m);
      else if (start > now) upcoming.push(m);
      else past.push(m);
    }
    upcoming.sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
    past.sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime));
    return { live, upcoming, past };
  }, [maintenancesEnvelope, now]);

  if (isLoadingResource || isLoadingPerms) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }

  if (resourceError || !resource) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-default-600 mb-4">{t('errors.resourceNotFound')}</p>
        <Button variant="ghost" onPress={() => navigate('/resources')}>
          <ArrowLeft className="w-4 h-4" />
          {t('errors.backToResources')}
        </Button>
      </div>
    );
  }

  if (!permissions?.canManage) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-default-600 mb-4">{t('errors.forbidden')}</p>
        <Button variant="ghost" onPress={() => navigate(`/resources/${resourceId}`)}>
          <ArrowLeft className="w-4 h-4" />
          {t('actions.backToResource')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
        <ResourceMaintenanceUpsertModal resourceId={resourceId}>
          {(open) => (
            <Button variant="primary" onPress={open} className="w-full sm:w-auto">
              <PlusIcon className="w-4 h-4" />
              {t('activity.actions.create')}
            </Button>
          )}
        </ResourceMaintenanceUpsertModal>
        <Button variant="ghost" onPress={openCreateDrawer} className="w-full sm:w-auto">
          <CalendarClockIcon className="w-4 h-4" />
          {t('actions.newSchedule')}
        </Button>
      </div>

      <StatStrip
        schedules={schedules ?? []}
        maintenances={maintenancesEnvelope?.data ?? []}
        now={now}
      />

      {isLoadingMaintenances ? null : (
        <LiveSection resourceId={resourceId} liveMaintenances={partitioned.live} />
      )}
      <RequestsSection resourceId={resourceId} />
      <UpcomingSection upcomingMaintenances={partitioned.upcoming} />
      <SchedulesTab
        resourceId={resourceId}
        schedules={schedules ?? []}
        isLoading={isLoadingSchedules}
        onCreate={openCreateDrawer}
        onEdit={openEditDrawer}
      />
      <HistorySection pastMaintenances={partitioned.past} />

      <ScheduleFormDrawer
        resourceId={resourceId}
        scheduleId={drawerScheduleId}
        isOpen={drawerOpen}
        onClose={closeDrawer}
      />
    </div>
  );
}
