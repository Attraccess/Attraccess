import { Card, CardContent } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useMemo } from 'react';
import {
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
} from '@attraccess/react-query-client';
import de from './de.json';
import en from './en.json';

interface Props {
  schedules: ResourceMaintenanceSchedule[];
  maintenances: ResourceMaintenance[];
  now: Date;
}

function relativeHours(target: Date, now: Date): string {
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return '—';
  const hours = Math.round(diffMs / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

export function StatStrip(props: Props) {
  const { schedules, maintenances, now } = props;
  const { t } = useTranslations({ de, en });

  const stats = useMemo(() => {
    const active = maintenances.filter((m) => {
      const start = new Date(m.startTime);
      const end = m.endTime ? new Date(m.endTime) : null;
      return start <= now && (!end || end > now);
    }).length;

    const upcoming = maintenances
      .filter((m) => new Date(m.startTime) > now)
      .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
    const nextRun = upcoming[0]
      ? t('stats.nextRunRelative', { value: relativeHours(new Date(upcoming[0].startTime), now) })
      : t('stats.nextRunNone');

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = maintenances.filter((m) => new Date(m.startTime) >= monthStart).length;

    return { active, schedules: schedules.length, nextRun, thisMonth };
  }, [schedules, maintenances, now, t]);

  const tiles = [
    { label: t('stats.active'), value: stats.active },
    { label: t('stats.schedules'), value: stats.schedules },
    { label: t('stats.nextRun'), value: stats.nextRun },
    { label: t('stats.thisMonth'), value: stats.thisMonth },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="py-4 px-4 flex flex-col items-center">
            <div className="text-2xl font-semibold">{tile.value}</div>
            <div className="text-xs uppercase tracking-wide text-default-500 mt-1">{tile.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
