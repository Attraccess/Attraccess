import { Button } from '@heroui/react';
import { useTranslations, DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { CheckCircleIcon } from 'lucide-react';
import { ResourceMaintenance } from '@attraccess/react-query-client';
import { MaintenanceReasonDisplay } from '../../../../components/MaintenanceReasonDisplay';
import { MarkDoneModal } from '../maintenance-management/mark-done';
import { SectionCard } from './section-card';
import de from './de.json';
import en from './en.json';

interface Props {
  resourceId: number;
  liveMaintenances: ResourceMaintenance[];
}

export function LiveSection(props: Props) {
  const { resourceId, liveMaintenances } = props;
  const { t } = useTranslations({ de, en });

  if (liveMaintenances.length === 0) return null;

  const pulse = (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
    </span>
  );

  return (
    <SectionCard icon={pulse} title={t('activity.live.label')} count={liveMaintenances.length} accent="success">
      <div className="flex flex-col gap-3">
        {liveMaintenances.map((m) => (
          <div
            key={m.id}
            className="rounded-lg border border-success/40 bg-success/5 p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium mb-1"><MaintenanceReasonDisplay reason={m.reason} /></div>
              <div className="text-xs text-default-600 flex flex-wrap gap-x-3 gap-y-1">
                <span>{t('activity.live.start')}: <DateTimeDisplay date={m.startTime} /></span>
                {m.endTime && (<span>{t('activity.live.end')}: <DateTimeDisplay date={m.endTime} /></span>)}
                {(m.createdByUser as { username?: string } | undefined)?.username && (
                  <span>{t('activity.live.createdBy', { name: String((m.createdByUser as { username?: string }).username) })}</span>
                )}
              </div>
            </div>
            <MarkDoneModal resourceId={resourceId} maintenanceId={m.id}>
              {(open) => (
                <Button variant="primary" onPress={open} className="w-full sm:w-auto shrink-0">
                  <CheckCircleIcon className="w-4 h-4" />
                  {t('activity.live.markDone')}
                </Button>
              )}
            </MarkDoneModal>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
