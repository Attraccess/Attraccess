import { Button, Tabs } from '@heroui/react';
import { DownloadIcon } from 'lucide-react';
import { AuditSettingsSummary } from './index.helpers';
import { AuditEntryDrawer } from './index.helpers';
import { AuditSettingsPanel } from './index.audit-settings-panel';
import { useAuditLogSectionState } from './useAuditLogSectionState';
import { AuditLogSectionTabsPanel } from './AuditLogSectionTabsPanel';

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
