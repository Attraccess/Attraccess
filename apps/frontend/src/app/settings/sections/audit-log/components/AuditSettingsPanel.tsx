import { Card, Label, NumberField, NumberFieldGroup, NumberFieldInput, Spinner, Tabs } from '@heroui/react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LabeledSwitch, StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  AuditSettingsDto,
  UseAuditServiceAuditControllerListKeyFn,
  UseSettingsServiceSettingsControllerGetAuditSettingsKeyFn,
  useSettingsServiceSettingsControllerGetAuditSettings,
  useSettingsServiceSettingsControllerUpdateAuditSettings,
} from '@attraccess/react-query-client';
import { SettingsSaveBar } from '../../../components/SettingsSaveBar';
import { coreAuditDomains, pluginDomains, toggleDomain, togglePluginDomain } from '../audit-log-model';
import { useAuditDomainLabel } from '../useAuditDomainLabel';
import { useAuditLogMeta } from '../useAuditLogMeta';
import en from '../en.json';
import de from '../de.json';

export function AuditSettingsPanel() {
  const { t } = useTranslations({ en, de });
  const client = useQueryClient();
  const domainLabel = useAuditDomainLabel();
  const meta = useAuditLogMeta();
  const pluginDomainEntries = pluginDomains(meta.data);
  const settings = useSettingsServiceSettingsControllerGetAuditSettings();
  const [draft, setDraft] = useState<AuditSettingsDto>();
  const [saved, setSaved] = useState(false);
  const currentSettings = draft ?? settings.data;
  const saveSettings = useSettingsServiceSettingsControllerUpdateAuditSettings({
    onSuccess: (next) => {
      client.setQueryData(UseSettingsServiceSettingsControllerGetAuditSettingsKeyFn(), next);
      setDraft(undefined);
      setSaved(true);
      void client.invalidateQueries({ queryKey: UseAuditServiceAuditControllerListKeyFn() });
    },
  });
  const editSettings = (next: AuditSettingsDto) => {
    setDraft(next);
    setSaved(false);
    saveSettings.reset();
  };
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(settings.data);
  return (
    <Tabs.Panel id="settings" className="max-w-3xl space-y-5 pt-5">
      <p className="text-sm text-muted">{t('settingsDescription')}</p>
      {settings.isPending ? (
        <Spinner />
      ) : settings.isError ? (
        <StatusAlert status="danger" title={t('settingsError')} />
      ) : (
        currentSettings && (
          <>
            <Card variant="secondary">
              <Card.Content>
                <LabeledSwitch
                  isSelected={currentSettings.enabled}
                  isDisabled={saveSettings.isPending}
                  onChange={(enabled) => editSettings({ ...currentSettings, enabled })}
                >
                  <div>
                    <p className="font-medium">{t('master')}</p>
                    <p className="mt-1 text-sm text-muted">{t('masterHint')}</p>
                  </div>
                </LabeledSwitch>
              </Card.Content>
            </Card>
            <section className="space-y-4">
              <div>
                <h3 className="font-semibold">{t('domainsTitle')}</h3>
                <p className="mt-1 text-sm text-muted">{t('domainsHint')}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {coreAuditDomains.map((domain) => (
                  <LabeledSwitch
                    key={domain}
                    isSelected={currentSettings.domains.includes(domain)}
                    isDisabled={saveSettings.isPending}
                    onChange={(enabled) =>
                      editSettings({
                        ...currentSettings,
                        domains: toggleDomain(currentSettings.domains, domain, enabled),
                      })
                    }
                  >
                    {domainLabel(domain)}
                  </LabeledSwitch>
                ))}
                {pluginDomainEntries.map((domain) => (
                  <LabeledSwitch
                    key={domain.id}
                    isSelected={!currentSettings.plugin_domains_disabled.includes(domain.id)}
                    isDisabled={saveSettings.isPending}
                    onChange={(enabled) =>
                      editSettings({
                        ...currentSettings,
                        plugin_domains_disabled: togglePluginDomain(
                          currentSettings.plugin_domains_disabled,
                          domain.id,
                          enabled,
                        ),
                      })
                    }
                  >
                    {domainLabel(domain.id)}
                  </LabeledSwitch>
                ))}
              </div>
            </section>
            <NumberField
              className="max-w-sm"
              value={currentSettings.retention_days}
              minValue={1}
              maxValue={3650}
              isDisabled={saveSettings.isPending}
              onChange={(retention_days) => editSettings({ ...currentSettings, retention_days })}
            >
              <Label>{t('retention')}</Label>
              <NumberFieldGroup>
                <NumberFieldInput />
              </NumberFieldGroup>
            </NumberField>
            <p className="text-sm text-muted">{t('retentionHint')}</p>
            {saveSettings.isError && <StatusAlert status="danger" title={t('saveError')} />}
            {saved && <StatusAlert status="success" title={t('saved')} />}
            <SettingsSaveBar
              isDirty={dirty}
              isSaving={saveSettings.isPending}
              isSaveDisabled={
                !Number.isInteger(currentSettings.retention_days) ||
                currentSettings.retention_days < 1 ||
                currentSettings.retention_days > 3650
              }
              onSave={() => saveSettings.mutate({ requestBody: currentSettings })}
              onDiscard={() => {
                setDraft(undefined);
                saveSettings.reset();
              }}
            />
          </>
        )
      )}
    </Tabs.Panel>
  );
}
