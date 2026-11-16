import { useMemo } from 'react';
import { Link } from '@heroui/react';
import type { DashboardWidgetRenderProps } from '@attraccess/plugins-frontend-sdk';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAttractapServiceGetReaders } from '@attraccess/react-query-client';
import { useNow } from '../../../hooks/useNow';
import { pairedReadersOnly } from '../../attractap/cardWriting';
import { isReaderStale } from '../../attractap/readerStaleness';
import { BigNumber, WidgetEmpty, WidgetError, WidgetList, WidgetLoading } from './widgetParts';
import de from './de.json';
import en from './en.json';

const MAX_STALE_READERS = 3;

/**
 * How many paired readers have not connected for a day, by the same rule as the readers page: in the success colour
 * when none, else the warning colour. Medium tiles list up to three of them, longest silent last.
 */
export function ReadersWidget({ size }: Readonly<DashboardWidgetRenderProps>) {
  const { t } = useTranslations({ en, de });
  const formatDateTime = useDateTimeFormatter();
  const now = useNow();
  const { data: readers, isPending, isError } = useAttractapServiceGetReaders();

  const { paired, stale } = useMemo(() => {
    const pairedReaders = pairedReadersOnly(readers);
    const staleReaders = pairedReaders
      .filter((reader) => isReaderStale(reader, now))
      .sort((a, b) => new Date(b.lastConnection).getTime() - new Date(a.lastConnection).getTime());
    return { paired: pairedReaders, stale: staleReaders };
  }, [readers, now]);

  if (isPending) return <WidgetLoading />;
  if (isError) return <WidgetError title={t('loadError')} />;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <BigNumber
        value={`${stale.length}/${paired.length}`}
        label={t('readers.offlineLabel')}
        className={stale.length === 0 ? 'text-success' : 'text-warning'}
        data-cy="dashboard-readers-offline"
      />
      {size !== 'small' &&
        (stale.length === 0 ? (
          <WidgetEmpty>{t('readers.allConnected')}</WidgetEmpty>
        ) : (
          <WidgetList>
            {stale.slice(0, MAX_STALE_READERS).map((reader) => (
              <li key={reader.id} className="flex min-w-0 items-center justify-between gap-2 text-sm">
                <Link
                  href={`/attractap/readers/${reader.id}/diagnostics`}
                  className="block min-w-0 max-w-full truncate leading-tight"
                >
                  {reader.name}
                </Link>
                <span className="shrink-0 text-xs text-muted">{formatDateTime(reader.lastConnection)}</span>
              </li>
            ))}
          </WidgetList>
        ))}
    </div>
  );
}
