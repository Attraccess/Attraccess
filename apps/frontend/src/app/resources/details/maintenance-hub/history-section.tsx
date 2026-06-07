import { Button } from '@heroui/react';
import { useTranslations, DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { useState, useMemo } from 'react';
import { HistoryIcon } from 'lucide-react';
import { ResourceMaintenance } from '@attraccess/react-query-client';
import { MaintenanceReasonDisplay } from '../../../../components/MaintenanceReasonDisplay';
import { SectionCard } from './section-card';
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

  const action =
    !showAll && pastMaintenances.length > visible.length ? (
      <Button variant="ghost" onPress={() => setShowAll(true)}>
        {t('activity.history.showAll')}
      </Button>
    ) : undefined;

  return (
    <SectionCard
      icon={<HistoryIcon className="w-4 h-4 text-default-500" />}
      title={t('activity.history.label')}
      action={action}
    >
      {!showAll && <p className="text-xs text-default-500 mb-3">{t('activity.history.subtitle')}</p>}

      {visible.length === 0 ? (
        <p className="text-sm text-default-500">{t('activity.history.empty')}</p>
      ) : (
        <div className="rounded-lg border border-default-200 divide-y divide-default-200">
          {visible.map((m) => {
            const completedBy = (m.completedByUser as { username?: string } | undefined)?.username;
            return (
              <div key={m.id} className="p-3 flex flex-col gap-1">
                <div className="font-medium text-sm"><MaintenanceReasonDisplay reason={m.reason} /></div>
                <div className="text-xs text-default-600 flex flex-wrap gap-x-3 gap-y-1">
                  <span>{t('activity.live.start')}: <DateTimeDisplay date={m.startTime} /></span>
                  {m.endTime && <span>{t('activity.live.end')}: <DateTimeDisplay date={m.endTime} /></span>}
                  {completedBy && (
                    <span>{t('activity.history.columns.completedBy')}: {String(completedBy)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
