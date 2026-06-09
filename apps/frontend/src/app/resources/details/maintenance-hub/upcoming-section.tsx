import { useTranslations, DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { CalendarClockIcon } from 'lucide-react';
import { ResourceMaintenance } from '@attraccess/react-query-client';
import { MaintenanceReasonDisplay } from '../../../../components/MaintenanceReasonDisplay';
import { SectionCard } from './section-card';
import de from './de.json';
import en from './en.json';

interface Props {
  upcomingMaintenances: ResourceMaintenance[];
}

export function UpcomingSection(props: Props) {
  const { upcomingMaintenances } = props;
  const { t } = useTranslations({ de, en });

  return (
    <SectionCard
      icon={<CalendarClockIcon className="w-4 h-4 text-default-500" />}
      title={t('activity.upcoming.label')}
      count={upcomingMaintenances.length}
    >
      {upcomingMaintenances.length === 0 ? (
        <p className="text-sm text-default-500">{t('activity.upcoming.empty')}</p>
      ) : (
        <div className="rounded-lg border border-default-200 divide-y divide-default-200">
          {upcomingMaintenances.map((m) => (
            <div key={m.id} className="p-3 flex flex-col gap-1">
              <div className="font-medium text-sm"><MaintenanceReasonDisplay reason={m.reason} /></div>
              <div className="text-xs text-default-600 flex flex-wrap gap-x-3 gap-y-1">
                <span>{t('activity.live.start')}: <DateTimeDisplay date={m.startTime} /></span>
                {m.endTime && <span>{t('activity.live.end')}: <DateTimeDisplay date={m.endTime} /></span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
