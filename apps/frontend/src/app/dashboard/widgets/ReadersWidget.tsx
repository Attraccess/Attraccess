import { useMemo } from 'react';
import { Link } from '@heroui/react';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAttractapServiceGetReaders } from '@attraccess/react-query-client';
import { useNow } from '../../../hooks/useNow';
import { pairedReadersOnly } from '../../attractap/cardWriting';
import { isReaderStale } from '../../attractap/readerStaleness';
import { WidgetEmpty, WidgetError, WidgetLinkButton, WidgetLoading } from './widgetParts';
import de from './de.json';
import en from './en.json';

const MAX_STALE_READERS = 3;

function Count({ label, value, 'data-cy': dataCy }: Readonly<{ label: string; value: number; 'data-cy': string }>) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-bold" data-cy={dataCy}>
        {value}
      </span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

/** How many readers are paired and which have not connected for a day, by the same rule as the readers page. */
export function ReadersWidget() {
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

  const renderContent = () => {
    if (isPending) return <WidgetLoading />;
    if (isError) return <WidgetError title={t('loadError')} />;
    return (
      <>
        <div className="flex gap-6">
          <Count label={t('readers.paired')} value={paired.length} data-cy="dashboard-readers-paired" />
          <Count label={t('readers.stale')} value={stale.length} data-cy="dashboard-readers-stale" />
        </div>
        {stale.length === 0 ? (
          <WidgetEmpty>{t('readers.allConnected')}</WidgetEmpty>
        ) : (
          <ul className="flex flex-col gap-1">
            {stale.slice(0, MAX_STALE_READERS).map((reader) => (
              <li key={reader.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/attractap/readers/${reader.id}/diagnostics`} className="truncate">
                  {reader.name}
                </Link>
                <span className="shrink-0 text-xs text-muted">{formatDateTime(reader.lastConnection)}</span>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {renderContent()}
      <div>
        <WidgetLinkButton href="/attractap/readers" data-cy="dashboard-readers-all">
          {t('readers.all')}
        </WidgetLinkButton>
      </div>
    </div>
  );
}
