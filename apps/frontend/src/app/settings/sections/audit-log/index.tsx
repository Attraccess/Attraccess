import { Button, Tabs, Spinner, Table } from '@heroui/react';
import { DownloadIcon, ChevronLeftIcon, ChevronRightIcon, FilterIcon, HistoryIcon } from 'lucide-react';
import {
  AuditSettingsSummary,
  AuditEntryDrawer,
  AuditSettingsPanel,
  useAuditLogSectionState,
  MobileEntries,
  auditLabel,
  Notice,
  actor,
  target,
} from './components/AuditLogPanels';
import { AuditLogFilters } from './components/AuditLogFilters';

type Props = Pick<
  ReturnType<typeof useAuditLogSectionState>,
  | 'setFiltersOpen'
  | 'filtersOpen'
  | 't'
  | 'activeFilterCount'
  | 'applyFilters'
  | 'filters'
  | 'updateFilter'
  | 'domainLabel'
  | 'pluginDomainEntries'
  | 'advanced'
  | 'filterError'
  | 'setAdvanced'
  | 'clearFilters'
  | 'activity'
  | 'setCursors'
  | 'client'
  | 'exportError'
  | 'items'
  | 'setSelected'
  | 'cursors'
>;

export function AuditLogSectionTabsPanel({
  setFiltersOpen,
  filtersOpen,
  t,
  activeFilterCount,
  applyFilters,
  filters,
  updateFilter,
  domainLabel,
  pluginDomainEntries,
  advanced,
  filterError,
  setAdvanced,
  clearFilters,
  activity,
  setCursors,
  client,
  exportError,
  items,
  setSelected,
  cursors,
}: Props) {
  return (
    <Tabs.Panel id="activity" className="space-y-5 pt-5">
      <Button
        className="md:hidden"
        variant="secondary"
        onPress={() => setFiltersOpen(!filtersOpen)}
        aria-expanded={filtersOpen}
      >
        <FilterIcon size={16} />
        {t('filters')}
        {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
      </Button>
      <AuditLogFilters
        {...{
          filtersOpen,
          applyFilters,
          t,
          filters,
          updateFilter,
          domainLabel,
          pluginDomainEntries,
          advanced,
          filterError,
          setAdvanced,
          activeFilterCount,
          clearFilters,
          activity,
          setCursors,
          client,
        }}
      />
      {exportError && <Notice title={t('exportError')} />}
      {activity.isPending ? (
        <div className="flex items-center justify-center gap-3 py-16">
          <Spinner size="sm" />
          <span className="text-sm text-muted">{t('loading')}</span>
        </div>
      ) : activity.isError ? (
        <div className="space-y-3">
          <Notice title={t('loadError')} />
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
          <div className="hidden md:block">
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label={t('activity')}>
                  <Table.Header>
                    <Table.Column isRowHeader>{t('activity')}</Table.Column>
                    <Table.Column>{t('actor')}</Table.Column>
                    <Table.Column>{t('target')}</Table.Column>
                    <Table.Column>{t('time')}</Table.Column>
                    <Table.Column aria-label={t('eventDetails')}>{t('eventDetails')}</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {items.map((entry) => (
                      <Table.Row key={entry.id} id={entry.id} textValue={entry.action}>
                        <Table.Cell>
                          <div className="space-y-1">
                            <p className="font-medium">{auditLabel('events', entry.action, t)}</p>
                            <div className="flex flex-wrap gap-2 text-xs text-muted">
                              <span>{domainLabel(entry.domain)}</span>
                              <span>·</span>
                              <span>{t(`outcomes.${entry.outcome}`)}</span>
                            </div>
                          </div>
                        </Table.Cell>
                        <Table.Cell>{actor(entry, t)}</Table.Cell>
                        <Table.Cell>
                          <span className="break-words">{target(entry, t)}</span>
                        </Table.Cell>
                        <Table.Cell>
                          <time className="whitespace-nowrap text-xs text-muted" dateTime={entry.at}>
                            {new Date(entry.at).toLocaleDateString()}
                            <br />
                            {new Date(entry.at).toLocaleTimeString()}
                          </time>
                        </Table.Cell>
                        <Table.Cell>
                          <Button
                            variant="ghost"
                            isIconOnly
                            aria-label={`${t('inspect')} #${entry.id}`}
                            onPress={() => setSelected(entry)}
                          >
                            <ChevronRightIcon size={18} />
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </div>
          <MobileEntries {...{ items, t, domainLabel, setSelected }} />
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

export function AuditLogSection() {
  const {
    t,
    client,
    canRead,
    canManage,
    filters,
    cursors,
    setCursors,
    selected,
    setSelected,
    advanced,
    setAdvanced,
    filtersOpen,
    setFiltersOpen,
    filterError,
    exporting,
    exportError,
    setDraft,
    saved,
    pluginDomainEntries,
    activity,
    settings,
    currentSettings,
    saveSettings,
    domainLabel,
    updateFilter,
    clearFilters,
    applyFilters,
    editSettings,
    dirty,
    exportFiltered,
    items,
    activeFilterCount,
  } = useAuditLogSectionState();

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold">{t('title')}</h2>
          <p className="text-sm text-muted">{t('description')}</p>
        </div>
        <Button
          variant="outline"
          onPress={exportFiltered}
          isPending={exporting}
          isDisabled={!canRead || activity.isError}
        >
          {<DownloadIcon size={16} />}
          {exporting ? t('exporting') : t('export')}
        </Button>
      </div>
      <AuditSettingsSummary settings={settings.data} />
      <Tabs defaultSelectedKey="activity">
        <Tabs.ListContainer>
          <Tabs.List aria-label={t('title')}>
            <Tabs.Tab id="activity">
              {t('activity')}
              <Tabs.Indicator />
            </Tabs.Tab>
            {canManage && (
              <Tabs.Tab id="settings">
                {t('settings')}
                <Tabs.Indicator />
              </Tabs.Tab>
            )}
          </Tabs.List>
        </Tabs.ListContainer>
        <AuditLogSectionTabsPanel
          {...{
            setFiltersOpen,
            filtersOpen,
            t,
            activeFilterCount,
            applyFilters,
            filters,
            updateFilter,
            domainLabel,
            pluginDomainEntries,
            advanced,
            filterError,
            setAdvanced,
            clearFilters,
            activity,
            setCursors,
            client,
            exportError,
            items,
            setSelected,
            cursors,
          }}
        />
        {canManage && (
          <AuditSettingsPanel
            settings={settings}
            currentSettings={currentSettings}
            saveSettings={saveSettings}
            editSettings={editSettings}
            pluginDomainEntries={pluginDomainEntries}
            domainLabel={domainLabel}
            saved={saved}
            dirty={dirty}
            onDiscard={() => {
              setDraft(undefined);
              saveSettings.reset();
            }}
          />
        )}
      </Tabs>
      <AuditEntryDrawer selected={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
