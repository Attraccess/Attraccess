import { Spinner } from '@heroui/react';
import { Activity } from 'lucide-react';
import { FlatSection } from '../../../../components/flatSection';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './operatingDurationCard.de.json';
import en from './operatingDurationCard.en.json';
import { useCanViewOperatingDuration, useOperatingDuration } from '../../operatingDuration';

interface OperatingDurationCardProps {
  resourceId: number;
  className?: string;
}

function formatDuration(durationMs: number | null, unavailable: string): string {
  if (durationMs === null) return unavailable;

  const seconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function OperatingDurationCard({ resourceId, className }: OperatingDurationCardProps) {
  const { t } = useTranslations({ de, en });
  const canView = useCanViewOperatingDuration(resourceId);
  const { data, isLoading } = useOperatingDuration(resourceId, canView);

  if (!canView) return null;

  return (
    <FlatSection className={className} icon={<Activity className="size-4" />} title={t('title')}>
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : !data ? null : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {data.operatingDataAvailable && (
            <div className="col-span-2 text-sm font-medium text-foreground-600">
              {data.isOperating ? t('running') : t('idle')}
            </div>
          )}
          <div>
            <dt className="text-foreground-500">{t('session')}</dt>
            <dd className="font-medium">{formatDuration(data.sessionDurationMs, t('unavailable'))}</dd>
          </div>
          <div>
            <dt className="text-foreground-500">{t('operating')}</dt>
            <dd className="font-medium">{formatDuration(data.operatingDurationMs, t('unavailable'))}</dd>
          </div>
          <div>
            <dt className="text-foreground-500">{t('unattributedOperating')}</dt>
            <dd className="font-medium">{formatDuration(data.unattributedOperatingDurationMs, t('unavailable'))}</dd>
          </div>
          {data.isProvisional && <div className="col-span-2 text-warning">{t('provisional')}</div>}
          {!data.operatingDataAvailable && <div className="col-span-2 text-foreground-500">{t('unavailable')}</div>}
        </dl>
      )}
    </FlatSection>
  );
}
