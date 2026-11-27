import { useEffect, useRef } from 'react';
import { Spinner } from '@heroui/react';
import { Gauge } from 'lucide-react';
import { useListResourceMeters } from '@attraccess/react-query-client';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { FlatSection } from '../../../../components/flatSection';
import { useAuth } from '../../../../hooks/useAuth';
import { MeterNameEditor } from './MeterNameEditor';
import { MeterActions, meterActionsId } from './MeterActions';
import { ArchivedMeters } from './ArchivedMeters';
import { useArchivedMeters } from './useArchivedMeters';
import { useMeterValueFormatter } from '../../../../hooks/useMeterValueFormatter';
import en from './en.json';
import de from './de.json';

export function MetersCard({ resourceId, className }: { resourceId: number; className?: string }) {
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  const { t } = useTranslations({ en, de });
  const format = useMeterValueFormatter();
  const { hasPermission } = useAuth();
  const manage = hasPermission('resources.update');
  const {
    data: meters = [],
    isLoading,
    isError,
  } = useListResourceMeters({ path: { resourceId } }, undefined, { refetchInterval: 10_000 });
  const { meters: archived, isError: archivedError } = useArchivedMeters(resourceId, manage);
  const card = useRef<HTMLDivElement>(null);
  const moved = useRef<{ meterId: number; restored: boolean; at: number } | null>(null);
  // A meter that was archived, restored or deleted takes its ⋮ menu along. Unless the user moved on, the focus goes to
  // the restored meter's menu, or else to "Create meter".
  useEffect(() => {
    const pending = moved.current;
    if (!pending || !card.current) return;
    // A restored meter's menu in the active list; until the lists are reloaded it may still sit among the archived.
    const own = pending.restored
      ? [...card.current.querySelectorAll<HTMLElement>(`[data-cy="${meterActionsId(pending.meterId)}"]`)].find(
          (menu) => !menu.closest('[data-cy="archived-meters"]'),
        )
      : undefined;
    if (pending.restored && !own && Date.now() - pending.at < 3_000) return;
    moved.current = null;
    const frame = requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      (own ?? card.current?.querySelector<HTMLElement>('[data-cy="meter-create"]'))?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [meters, archived]);
  const onMoved = (change: { meterId: number; restored: boolean }) => {
    moved.current = { ...change, at: Date.now() };
  };
  if (!meters.length && !manage && !isLoading && !isError) return null;
  return (
    <FlatSection className={className} icon={<Gauge className="size-4" />} title={t('title')}>
      <div ref={card} className="flex flex-col gap-4" data-cy="resource-meters">
        <p className="text-sm text-muted">{t('description')}</p>
        {isLoading && <Spinner size="sm" />}
        {(isError || archivedError) && <p role="alert">{t('loadError')}</p>}
        {!isLoading && !isError && !archivedError && !meters.length && (
          <p className="text-sm">{t(archived.length ? 'emptyActive' : 'empty')}</p>
        )}
        {meters.map((meter) => (
          <div key={meter.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="min-w-0 flex-1 font-medium break-all">{meter.name}</h3>
              {manage && <MeterActions resourceId={resourceId} meter={meter} onMoved={onMoved} />}
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-muted">{t('lifetime')}</dt>
                <dd className="font-medium break-all">{format(meter.lifetimeValue)}</dd>
              </div>
              <div>
                <dt className="text-muted break-all">
                  {meter.session ? t('sessionName', { name: meter.session.meterName }) : t('session')}
                </dt>
                <dd className="font-medium break-all">
                  {meter.session
                    ? meter.session.latestValue == null
                      ? meter.session.sessionId === null
                        ? t('unavailable')
                        : t('waiting')
                      : format(meter.session.latestValue)
                    : t('idle')}
                </dd>
              </div>
            </dl>
            {meter.latestObservedAt && (
              <p className="text-xs text-muted">{t('asOf', { time: formatDateTime(meter.latestObservedAt) })}</p>
            )}
          </div>
        ))}
        {manage && <MeterNameEditor resourceId={resourceId} />}
        {manage && <ArchivedMeters resourceId={resourceId} meters={archived} onMoved={onMoved} />}
      </div>
    </FlatSection>
  );
}
