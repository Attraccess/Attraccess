import { Button, Spinner, Tabs } from '@heroui/react';
import { ChevronLeftIcon, ChevronRightIcon, HistoryIcon } from 'lucide-react';
import { StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import { AuditEntryDto } from '@attraccess/react-query-client';
import { AuditLogFilterState } from '../useAuditLogFilterState';
import { useAuditLogActivity } from '../useAuditLogActivity';
import { AuditEntriesTable } from './AuditEntriesTable';
import { AuditLogFilters } from './AuditLogFilters';
import { MobileEntries } from './MobileEntries';
import en from '../en.json';
import de from '../de.json';

interface AuditLogActivityPanelProps {
  filterState: AuditLogFilterState;
  exportError: boolean;
  onInspect: (entry: AuditEntryDto) => void;
}

export function AuditLogActivityPanel({ filterState, exportError, onInspect }: AuditLogActivityPanelProps) {
  const { t } = useTranslations({ en, de });
  const { cursors, setCursors, activeFilterCount, clearFilters } = filterState;
  const activity = useAuditLogActivity(filterState);
  const items = activity.data?.items ?? [];
  return (
    <Tabs.Panel id="activity" className="space-y-5 pt-5">
      <AuditLogFilters filterState={filterState} isRefreshing={activity.isFetching} />
      {exportError && <StatusAlert status="danger" title={t('exportError')} />}
      {activity.isPending ? (
        <div className="flex items-center justify-center gap-3 py-16">
          <Spinner size="sm" />
          <span className="text-sm text-muted">{t('loading')}</span>
        </div>
      ) : activity.isError ? (
        <div className="space-y-3">
          <StatusAlert status="danger" title={t('loadError')} />
          <Button variant="secondary" onPress={() => void activity.refetch()}>
            {t('retry')}
          </Button>
        </div>
      ) : !items.length ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-separator px-6 py-12 text-center">
          <HistoryIcon size={28} className="text-muted" />
          <h3 className="font-semibold">{t('empty')}</h3>
          <p className="max-w-md text-sm text-muted">{t('emptyHint')}</p>
          {activeFilterCount > 0 && (
            <Button variant="secondary" onPress={clearFilters}>
              {t('clear')}
            </Button>
          )}
        </div>
      ) : (
        <>
          <AuditEntriesTable items={items} onInspect={onInspect} />
          <MobileEntries items={items} onInspect={onInspect} />
        </>
      )}
      {!activity.isError && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-separator pt-4">
          <p className="text-xs text-muted">
            {t('page')} {cursors.length} · {items.length} {t('eventsOnPage')}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              isDisabled={cursors.length === 1 || activity.isFetching}
              onPress={() => setCursors((current) => current.slice(0, -1))}
            >
              <ChevronLeftIcon size={16} />
              {t('previous')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              isDisabled={!activity.data?.nextCursor || activity.isFetching}
              onPress={() => {
                if (activity.data?.nextCursor)
                  setCursors((current) => [...current, activity.data.nextCursor ?? undefined]);
              }}
            >
              {t('next')}
              <ChevronRightIcon size={16} />
            </Button>
          </div>
        </div>
      )}
    </Tabs.Panel>
  );
}
