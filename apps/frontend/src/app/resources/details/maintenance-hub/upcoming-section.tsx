import { useTranslations, DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { ResourceMaintenance } from '@attraccess/react-query-client';
import { MaintenanceReasonDisplay } from '../../../../components/MaintenanceReasonDisplay';
import de from './de.json';
import en from './en.json';

interface Props {
  upcomingMaintenances: ResourceMaintenance[];
}

export function UpcomingSection(props: Props) {
  const { upcomingMaintenances } = props;
  const { t } = useTranslations({ de, en });

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {t('activity.upcoming.label')} · {upcomingMaintenances.length}
        </h3>
      </div>

      {upcomingMaintenances.length === 0 ? (
        <p className="text-sm text-default-500">{t('activity.upcoming.empty')}</p>
      ) : (
        <div className="rounded-lg border border-default-200 divide-y divide-default-200">
          {upcomingMaintenances.map((m) => (
            <div key={m.id} className="grid grid-cols-3 gap-2 p-3 text-sm">
              <div><DateTimeDisplay date={m.startTime} /></div>
              <div>{m.endTime ? <DateTimeDisplay date={m.endTime} /> : '—'}</div>
              <div className="truncate"><MaintenanceReasonDisplay reason={m.reason} /></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
