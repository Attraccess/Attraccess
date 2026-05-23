import { Button } from '@heroui/react';
import { useTranslations, DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { useState, useMemo } from 'react';
import { ResourceMaintenance } from '@attraccess/react-query-client';
import { MaintenanceReasonDisplay } from '../../../../components/MaintenanceReasonDisplay';
import de from './de.json';
import en from './en.json';

interface Props {
  pastMaintenances: ResourceMaintenance[];
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function HistorySection(props: Props) {
  const { pastMaintenances } = props;
  const { t } = useTranslations({ de, en });
  const [showAll, setShowAll] = useState(false);

  const visible = useMemo(() => {
    if (showAll) return pastMaintenances;
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    return pastMaintenances.filter((m) => new Date(m.startTime).getTime() >= cutoff);
  }, [pastMaintenances, showAll]);

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {t('activity.history.label')}
        </h3>
        <span className="text-xs text-default-500">
          {showAll ? '' : t('activity.history.subtitle')}
        </span>
        {!showAll && pastMaintenances.length > visible.length && (
          <Button variant="ghost" onPress={() => setShowAll(true)} className="ml-auto">
            {t('activity.history.showAll')}
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-default-500">{t('activity.history.empty')}</p>
      ) : (
        <div className="rounded-lg border border-default-200 divide-y divide-default-200">
          {visible.map((m) => (
            <div key={m.id} className="grid grid-cols-4 gap-2 p-3 text-sm">
              <div><DateTimeDisplay date={m.startTime} /></div>
              <div>{m.endTime ? <DateTimeDisplay date={m.endTime} /> : '—'}</div>
              <div className="truncate"><MaintenanceReasonDisplay reason={m.reason} /></div>
              <div>{String((m.completedByUser as { username?: string } | undefined)?.username ?? '—')}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
