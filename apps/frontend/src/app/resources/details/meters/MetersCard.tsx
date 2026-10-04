import { Spinner } from '@heroui/react';
import { Gauge } from 'lucide-react';
import { useResourceMeteringServiceListResourceMeters } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { FlatSection } from '../../../../components/flatSection';
import { useAuth } from '../../../../hooks/useAuth';
import { MeterNameEditor } from './MeterNameEditor';
import { useMeterValueFormatter } from './useMeterValueFormatter';
import en from './en.json';
import de from './de.json';

export function MetersCard({ resourceId, className }: { resourceId: number; className?: string }) {
  const { t } = useTranslations({ en, de });
  const format = useMeterValueFormatter();
  const { hasPermission } = useAuth();
  const {
    data: meters = [],
    isLoading,
    isError,
  } = useResourceMeteringServiceListResourceMeters({ resourceId }, undefined, { refetchInterval: 10_000 });
  const manage = hasPermission('resources.update');
  if (!meters.length && !manage && !isLoading && !isError) return null;
  return (
    <FlatSection className={className} icon={<Gauge className="size-4" />} title={t('title')}>
      <div className="flex flex-col gap-4" data-cy="resource-meters">
        <p className="text-sm text-muted">{t('description')}</p>
        {isLoading && <Spinner size="sm" />}
        {isError && <p role="alert">{t('loadError')}</p>}
        {!isLoading && !isError && !meters.length && <p className="text-sm">{t('empty')}</p>}
        {meters.map((meter) => (
          <div key={meter.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium break-all">{meter.name}</h3>
              {manage && <MeterNameEditor resourceId={resourceId} meter={meter} />}
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-muted">{t('lifetime')}</dt>
                <dd className="font-medium break-all">{format(meter.lifetimeValue)}</dd>
              </div>
              <div>
                <dt className="text-muted">{t('session')}</dt>
                <dd className="font-medium break-all">
                  {meter.session
                    ? meter.session.latestValue == null
                      ? t('waiting')
                      : format(meter.session.latestValue)
                    : t('idle')}
                </dd>
              </div>
            </dl>
            {meter.latestObservedAt && (
              <p className="text-xs text-muted">
                {t('asOf', { time: new Date(meter.latestObservedAt).toLocaleString() })}
              </p>
            )}
          </div>
        ))}
        {manage && <MeterNameEditor resourceId={resourceId} />}
      </div>
    </FlatSection>
  );
}
