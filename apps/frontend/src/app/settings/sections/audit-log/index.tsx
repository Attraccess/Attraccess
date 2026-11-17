import { useState } from 'react';
import { Tabs } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { AuditEntryDto } from '@attraccess/react-query-client';
import { useAuth } from '../../../../hooks/useAuth';
import { AuditEntryDrawer } from './components/AuditEntryDrawer';
import { AuditLogActivityPanel } from './components/AuditLogActivityPanel';
import { AuditLogExportButton } from './components/AuditLogExportButton';
import { AuditSettingsPanel } from './components/AuditSettingsPanel';
import { AuditSettingsSummary } from './components/AuditSettingsSummary';
import { useAuditLogFilterState } from './useAuditLogFilterState';
import en from './en.json';
import de from './de.json';

export function AuditLogSection() {
  const { t } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  const canManage = hasPermission('system.settings.manage');
  const filterState = useAuditLogFilterState();
  const [selected, setSelected] = useState<AuditEntryDto | null>(null);
  const [exportError, setExportError] = useState(false);

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold">{t('title')}</h2>
          <p className="text-sm text-muted">{t('description')}</p>
        </div>
        <AuditLogExportButton filterState={filterState} onExportError={setExportError} />
      </div>
      <AuditSettingsSummary />
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
        <AuditLogActivityPanel filterState={filterState} exportError={exportError} onInspect={setSelected} />
        {canManage && <AuditSettingsPanel />}
      </Tabs>
      <AuditEntryDrawer selected={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
