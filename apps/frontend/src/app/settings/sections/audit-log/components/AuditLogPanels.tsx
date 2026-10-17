import {
  Button,
  Card,
  Chip,
  Label,
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
  Spinner,
  Tabs,
  Drawer,
  ListBox,
  Select,
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
} from '@heroui/react';
import { ChevronRightIcon, ShieldCheckIcon } from 'lucide-react';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  AuditSettingsDto,
  useSettingsServiceSettingsControllerUpdateAuditSettings,
  AuditEntryDto,
  AuditService,
  useAuditServiceAuditControllerList,
  useAuditServiceAuditControllerMeta,
  useSettingsServiceSettingsControllerGetAuditSettings,
  UseAuditServiceAuditControllerListKeyFn,
  UseSettingsServiceSettingsControllerGetAuditSettingsKeyFn,
} from '@attraccess/react-query-client';
import { LabeledSwitch } from '../../../../../components/labeledSwitch';
import { SettingsSaveBar } from '../../../components/SettingsSaveBar';
import {
  coreAuditDomains,
  pluginDomains,
  toggleDomain,
  togglePluginDomain,
  humanize,
  changes,
  displayValue,
  auditCsv,
  AuditFilters,
  emptyFilters,
  exportAuditEntries,
  filterRequest,
  pluginDomainLabel,
} from '../audit-log-model';
import en from '../en.json';
import de from '../de.json';
import { AlertStatusIcon } from '../../../../../components/AlertStatusIcon';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../../../hooks/useAuth';

export function EntryDetails({ entry, t }: { entry: AuditEntryDto; t: Translate }) {
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  const diff = changes(entry);
  const metadata = Object.entries(entry.details).filter(([key]) => !['before', 'after'].includes(key));
  return (
    <div className="space-y-6">
      <Chip
        color={entry.outcome === 'failed' ? 'danger' : entry.outcome === 'succeeded' ? 'success' : 'default'}
        size="sm"
      >
        {t(`outcomes.${entry.outcome}`)}
      </Chip>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
        <dt className="text-muted">{t('eventType')}</dt>
        <dd className="break-all">{entry.action}</dd>
        <dt className="text-muted">{t('time')}</dt>
        <dd>{formatDateTime(entry.at)}</dd>
        <dt className="text-muted">{t('actor')}</dt>
        <dd className="break-words">
          {actor(entry, t)}
          {entry.actorId !== null && <p className="text-xs text-muted">#{entry.actorId}</p>}
          {entry.actorUsernameSource && <p className="text-xs text-muted">{t(`${entry.actorUsernameSource}Name`)}</p>}
        </dd>
        <dt className="text-muted">{t('target')}</dt>
        <dd className="break-words">
          {target(entry, t)}
          <p className="text-xs text-muted">
            {entry.subjectType}
            {entry.subjectId === null ? '' : ` #${entry.subjectId}`}
          </p>
          {entry.subjectLabelSource && <p className="text-xs text-muted">{t(`${entry.subjectLabelSource}Name`)}</p>}
        </dd>
        <dt className="text-muted">{t('source')}</dt>
        <dd>{entry.authenticationMethod ?? entry.pluginId ?? t('notRecorded')}</dd>
        {typeof entry.apiTokenId === 'number' && (
          <>
            <dt className="text-muted">{t('apiTokenId')}</dt>
            <dd>#{entry.apiTokenId}</dd>
          </>
        )}
        {entry.pluginId && (
          <>
            <dt className="text-muted">{t('pluginId')}</dt>
            <dd className="break-all">{entry.pluginId}</dd>
          </>
        )}
        {entry.ipAddress && (
          <>
            <dt className="text-muted">{t('ipAddress')}</dt>
            <dd className="break-all">{entry.ipAddress}</dd>
          </>
        )}
        {entry.userAgent && (
          <>
            <dt className="text-muted">{t('userAgent')}</dt>
            <dd className="break-all">{entry.userAgent}</dd>
          </>
        )}
      </dl>
      {diff.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-semibold">{t('whatChanged')}</h3>
          {diff.map((change) => (
            <Card key={change.field} variant="secondary">
              <Card.Header>
                <Card.Title className="text-sm">{auditLabel('fields', change.field, t)}</Card.Title>
              </Card.Header>
              <Card.Content className="grid grid-cols-2 gap-4 text-sm">
                <div className="min-w-0">
                  <p className="mb-1 text-xs text-muted">{t('before')}</p>
                  <pre className="whitespace-pre-wrap break-words font-sans">
                    {change.before === undefined ? t('notRecorded') : displayValue(change.before)}
                  </pre>
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-xs text-muted">{t('after')}</p>
                  <pre className="whitespace-pre-wrap break-words font-sans">
                    {change.after === undefined ? t('notRecorded') : displayValue(change.after)}
                  </pre>
                </div>
              </Card.Content>
            </Card>
          ))}
        </section>
      )}
      <section className="space-y-3">
        <h3 className="font-semibold">{t('recordedDetails')}</h3>
        {metadata.length ? (
          <dl className="space-y-3">
            {metadata.map(([key, value]) => (
              <div key={key} className="space-y-1">
                <dt className="text-xs text-muted">{auditLabel('fields', key, t)}</dt>
                <dd className="whitespace-pre-wrap break-words text-sm">{displayValue(value)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted">{t('noDetails')}</p>
        )}
      </section>
      <div className="space-y-2 border-t border-separator pt-4 text-xs text-muted">
        <p>{t('operationId')}</p>
        <p className="break-all font-mono">{entry.operationId}</p>
        <p>{t('immutable')}</p>
      </div>
    </div>
  );
}

export type Translate = (key: string) => string;

export function actor(entry: AuditEntryDto, t: Translate) {
  return entry.actorUsername
    ? `${entry.actorUsername}${entry.actorUsernameSource === 'current' ? ` (${t('currentNameShort')})` : ''}`
    : entry.actorId === null
      ? t('unknownActor')
      : `#${entry.actorId}`;
}

export function auditLabel(section: 'events' | 'targets' | 'fields' | 'settingNames', value: string, t: Translate) {
  return Object.hasOwn(en[section], value) ? t(`${section}[${JSON.stringify(value)}]`) : humanize(value);
}

export function AuditEntryDrawer({ selected, onClose }: { selected: AuditEntryDto | null; onClose: () => void }) {
  const { t } = useTranslations({ en, de });
  return (
    <Drawer
      isOpen={!!selected}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.Backdrop>
        <Drawer.Content placement="right">
          <Drawer.Dialog className="w-full max-w-xl">
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading>{selected ? auditLabel('events', selected.action, t) : t('eventDetails')}</Drawer.Heading>
              <p className="text-xs text-muted">
                {t('eventDetails')} #{selected?.id}
              </p>
            </Drawer.Header>
            <Drawer.Body>{selected && <EntryDetails entry={selected} t={t} />}</Drawer.Body>
            <Drawer.Footer>
              <Button variant="secondary" slot="close">
                {t('close')}
              </Button>
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}

export function AuditSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Select
      className="min-w-0"
      value={value || 'all'}
      onChange={(key) => onChange(key === 'all' ? '' : String(key ?? ''))}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.value || 'all'} id={option.value || 'all'} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export function AuditSettingsSummary({ settings }: { settings: AuditSettingsDto | undefined }) {
  const { t } = useTranslations({ en, de });
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
      <ShieldCheckIcon size={16} className={settings?.enabled ? 'text-success' : 'text-muted'} />
      <span>{settings ? t(settings.enabled ? 'enabled' : 'disabled') : t('unknownSettings')}</span>
      {settings && (
        <>
          <span aria-hidden>·</span>
          <span>
            {settings.retention_days} {t('retainedDays')}
          </span>
        </>
      )}
    </div>
  );
}

export function Notice({
  title,
  description,
  status = 'danger',
}: {
  title: string;
  description?: string;
  status?: 'danger' | 'success';
}) {
  return (
    <Alert status={status}>
      <AlertStatusIcon status={status} />
      <AlertContent>
        <AlertTitle>{title}</AlertTitle>
        {description && <AlertDescription>{description}</AlertDescription>}
      </AlertContent>
    </Alert>
  );
}

export function target(entry: AuditEntryDto, t: Translate) {
  if (entry.subjectType === 'setting' && typeof entry.details.settingKey === 'string')
    return auditLabel('settingNames', entry.details.settingKey, t);
  return (
    (entry.subjectLabel &&
      `${entry.subjectLabel}${entry.subjectLabelSource === 'current' ? ` (${t('currentNameShort')})` : ''}`) ||
    (entry.subjectId === null ? t('noTarget') : `${auditLabel('targets', entry.subjectType, t)} #${entry.subjectId}`)
  );
}

export function AuditSettingsPanel({
  settings,
  currentSettings,
  saveSettings,
  editSettings,
  pluginDomainEntries,
  domainLabel,
  saved,
  dirty,
  onDiscard,
}: {
  settings: { isPending: boolean; isError: boolean };
  currentSettings: AuditSettingsDto | undefined;
  saveSettings: Pick<
    ReturnType<typeof useSettingsServiceSettingsControllerUpdateAuditSettings>,
    'isPending' | 'isError' | 'mutate'
  >;
  editSettings: (next: AuditSettingsDto) => void;
  pluginDomainEntries: ReturnType<typeof pluginDomains>;
  domainLabel: (domain: string) => string;
  saved: boolean;
  dirty: boolean;
  onDiscard: () => void;
}) {
  const { t } = useTranslations({ en, de });
  return (
    <Tabs.Panel id="settings" className="max-w-3xl space-y-5 pt-5">
      <p className="text-sm text-muted">{t('settingsDescription')}</p>
      {settings.isPending ? (
        <Spinner />
      ) : settings.isError ? (
        <Notice title={t('settingsError')} />
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
            {saveSettings.isError && <Notice title={t('saveError')} />}
            {saved && <Notice status="success" title={t('saved')} />}
            <SettingsSaveBar
              isDirty={dirty}
              isSaving={saveSettings.isPending}
              isSaveDisabled={
                !Number.isInteger(currentSettings.retention_days) ||
                currentSettings.retention_days < 1 ||
                currentSettings.retention_days > 3650
              }
              onSave={() => saveSettings.mutate({ requestBody: currentSettings })}
              onDiscard={onDiscard}
            />
          </>
        )
      )}
    </Tabs.Panel>
  );
}

export function useAuditLogSectionState() {
  const { t, language } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const canRead = hasPermission('system.audit.read');
  const canManage = hasPermission('system.settings.manage');
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters);
  const [applied, setApplied] = useState<AuditFilters>(emptyFilters);
  const [cursors, setCursors] = useState<Array<number | undefined>>([undefined]);
  const [selected, setSelected] = useState<AuditEntryDto | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterError, setFilterError] = useState<string>();
  const [fromDateValid, setFromDateValid] = useState(true);
  const [toDateValid, setToDateValid] = useState(true);
  const [dateFieldResetCount, setDateFieldResetCount] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [draft, setDraft] = useState<AuditSettingsDto>();
  const [saved, setSaved] = useState(false);
  const meta = useAuditServiceAuditControllerMeta(undefined, { enabled: canRead || canManage });
  const pluginDomainEntries = pluginDomains(meta.data);
  const parsed = filterRequest(applied, meta.data?.subjectTypes);
  const request = { ...parsed.request, beforeId: cursors.at(-1), limit: 50 };
  const activity = useAuditServiceAuditControllerList(request, undefined, { enabled: canRead });
  const settings = useSettingsServiceSettingsControllerGetAuditSettings(undefined, { enabled: canManage });
  const currentSettings = draft ?? settings.data;
  const saveSettings = useSettingsServiceSettingsControllerUpdateAuditSettings({
    onSuccess: (next) => {
      client.setQueryData(UseSettingsServiceSettingsControllerGetAuditSettingsKeyFn(), next);
      setDraft(undefined);
      setSaved(true);
      void client.invalidateQueries({ queryKey: UseAuditServiceAuditControllerListKeyFn() });
    },
  });
  const domainLabel = (domain: string) =>
    pluginDomainLabel(pluginDomainEntries.find((entry) => entry.id === domain)?.labels, language) ??
    (Object.hasOwn(en.domains, domain) ? t(`domains.${domain}`) : humanize(domain));
  const updateFilter = (key: keyof AuditFilters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const clearFilters = () => {
    setDateFieldResetCount((count) => count + 1);
    setFilters(emptyFilters);
    setApplied(emptyFilters);
    setCursors([undefined]);
    setFilterError(undefined);
  };
  const applyFilters = () => {
    if (!fromDateValid || !toDateValid) return;
    const result = filterRequest(filters, meta.data?.subjectTypes);
    if (result.error) {
      setFilterError(t(result.error));
      return;
    }
    setFilterError(undefined);
    setApplied({ ...filters });
    setCursors([undefined]);
    setFiltersOpen(false);
  };
  const editSettings = (next: AuditSettingsDto) => {
    setDraft(next);
    setSaved(false);
    saveSettings.reset();
  };
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(settings.data);
  const exportFiltered = async () => {
    setExporting(true);
    setExportError(false);
    try {
      const entries = await exportAuditEntries(parsed.request ?? {}, (query) =>
        AuditService.auditControllerList(query),
      );
      const url = URL.createObjectURL(new Blob([auditCsv(entries)], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  };
  const items = activity.data?.items ?? [];
  const activeFilterCount = Object.values(applied).filter(Boolean).length;
  return {
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
    fromDateValid,
    setFromDateValid,
    toDateValid,
    setToDateValid,
    dateFieldResetCount,
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
  } as const;
}

type Props = Pick<ReturnType<typeof useAuditLogSectionState>, 'items' | 't' | 'domainLabel' | 'setSelected'>;

export function MobileEntries({ items, t, domainLabel, setSelected }: Props) {
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  return (
    <div className="space-y-3 md:hidden">
      {items.map((entry) => (
        <Card key={entry.id} variant="secondary">
          <Card.Header>
            <div className="flex justify-between gap-3">
              <Chip size="sm">{domainLabel(entry.domain)}</Chip>
              <time className="text-xs text-muted" dateTime={entry.at}>
                {formatDateTime(entry.at)}
              </time>
            </div>
            <Card.Title>{auditLabel('events', entry.action, t)}</Card.Title>
            <Card.Description>
              {actor(entry, t)} · {target(entry, t)}
            </Card.Description>
          </Card.Header>
          <Card.Footer className="justify-between">
            <Button size="sm" variant="ghost" onPress={() => setSelected(entry)}>
              {t('inspect')}
              <ChevronRightIcon size={16} />
            </Button>
            <Chip
              size="sm"
              color={entry.outcome === 'failed' ? 'danger' : entry.outcome === 'succeeded' ? 'success' : 'default'}
            >
              {t(`outcomes.${entry.outcome}`)}
            </Chip>
          </Card.Footer>
        </Card>
      ))}
    </div>
  );
}
