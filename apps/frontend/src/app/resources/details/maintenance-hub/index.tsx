import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Button, Tabs, TabList, Tab, TabPanel, Spinner, Card } from '@heroui/react';
import { PlusIcon, ArrowLeft } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useResourceMaintenancesServiceCanManageMaintenance,
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedules,
  useResourceMaintenancesServiceFindMaintenances,
  useResourcesServiceGetOneResourceById,
} from '@attraccess/react-query-client';
import { useNow } from '../../../../hooks/useNow';
import { StatStrip } from './stat-strip';
import { SchedulesTab } from './schedules-tab';
import { ActivityTab } from './activity-tab';
import { ScheduleFormDrawer } from './schedule-form-drawer';
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

  const [tab, setTab] = useState<'schedules' | 'activity'>('schedules');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerScheduleId, setDrawerScheduleId] = useState<number | undefined>(undefined);

  const openCreateDrawer = () => { setDrawerScheduleId(undefined); setDrawerOpen(true); };
  const openEditDrawer = (id: number) => { setDrawerScheduleId(id); setDrawerOpen(true); };
  const closeDrawer = () => setDrawerOpen(false);

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
    <div>
      <div className="flex justify-end mb-4">
        <Button variant="primary" onPress={openCreateDrawer}>
          <PlusIcon className="w-4 h-4" />
          {t('actions.newSchedule')}
        </Button>
      </div>

      <div className="space-y-6 mb-6">
        <StatStrip
          schedules={schedules ?? []}
          maintenances={maintenancesEnvelope?.data ?? []}
          now={now}
        />

        <Card>
          <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as 'schedules' | 'activity')}>
            <TabList>
              <Tab id="schedules">{t('tabs.schedules')}</Tab>
              <Tab id="activity">{t('tabs.activity')}</Tab>
            </TabList>
            <TabPanel id="schedules">
              <div className="p-4">
                <SchedulesTab
                  resourceId={resourceId}
                  schedules={schedules ?? []}
                  isLoading={isLoadingSchedules}
                  onCreate={openCreateDrawer}
                  onEdit={openEditDrawer}
                />
              </div>
            </TabPanel>
            <TabPanel id="activity">
              <div className="p-4">
                <ActivityTab
                  resourceId={resourceId}
                  maintenances={maintenancesEnvelope?.data ?? []}
                  isLoading={isLoadingMaintenances}
                />
              </div>
            </TabPanel>
          </Tabs>
        </Card>
      </div>

      <ScheduleFormDrawer
        resourceId={resourceId}
        scheduleId={drawerScheduleId}
        isOpen={drawerOpen}
        onClose={closeDrawer}
      />
    </div>
  );
}
