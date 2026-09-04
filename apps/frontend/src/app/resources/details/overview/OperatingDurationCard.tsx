import { Spinner } from '@heroui/react';
import { Activity } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getBaseUrl } from '../../../../api';
import { FlatSection } from '../../../../components/flatSection';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './operatingDurationCard.de.json';
import en from './operatingDurationCard.en.json';

interface OperatingDurationSummary {
  sessionDurationMs: number;
  operatingDataAvailable: boolean;
  operatingDurationMs: number | null;
  unattributedOperatingDurationMs: number | null;
  isProvisional: boolean;
}

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
  const { data, isLoading } = useQuery({
    queryKey: ['resource-operating-attribution', resourceId],
    queryFn: async () => {
      const response = await fetch(`${getBaseUrl()}/api/resources/${resourceId}/operating-attribution`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load operating duration');
      return response.json() as Promise<OperatingDurationSummary>;
    },
  });

  return (
    <FlatSection className={className} icon={<Activity className="size-4" />} title={t('title')}>
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : !data ? null : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
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
