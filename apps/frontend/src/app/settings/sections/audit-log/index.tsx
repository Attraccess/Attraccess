import { useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  Chip,
  Drawer,
  Input,
  Label,
  ListBox,
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
  Select,
  Spinner,
  Table,
  Tabs,
  TextField,
} from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { AuditEntryDto, AuditService, AuditSettingsDto, SettingsService } from '@attraccess/react-query-client';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FilterIcon,
  HistoryIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { useAuth } from '../../../../hooks/useAuth';
import { AlertStatusIcon } from '../../../../components/AlertStatusIcon';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { SettingsSaveBar } from '../../components/SettingsSaveBar';
import {
  auditCsv,
  auditDomains,
  AuditFilters,
  changes,
  displayValue,
  emptyFilters,
  exportAuditEntries,
  filterRequest,
  humanize,
  toggleDomain,
} from './audit-log-model';
import en from './en.json';
import de from './de.json';

type Translate = (key: string) => string;

function auditLabel(section: 'events' | 'targets' | 'fields' | 'settingNames', value: string, t: Translate) {
  return Object.hasOwn(en[section], value) ? t(`${section}[${JSON.stringify(value)}]`) : humanize(value);
}

function Notice({
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

function AuditSelect({
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

function actor(entry: AuditEntryDto, t: Translate) {
  return entry.actorUsername
    ? `${entry.actorUsername}${entry.actorUsernameSource === 'current' ? ` (${t('currentNameShort')})` : ''}`
    : entry.actorId === null
      ? t('unknownActor')
      : `#${entry.actorId}`;
}
function target(entry: AuditEntryDto, t: Translate) {
  if (entry.subjectType === 'setting' && typeof entry.details.settingKey === 'string')
    return auditLabel('settingNames', entry.details.settingKey, t);
  return (
    (entry.subjectLabel &&
      `${entry.subjectLabel}${entry.subjectLabelSource === 'current' ? ` (${t('currentNameShort')})` : ''}`) ||
    (entry.subjectId === null ? t('noTarget') : `${auditLabel('targets', entry.subjectType, t)} #${entry.subjectId}`)
  );
}

function EntryDetails({ entry, t }: { entry: AuditEntryDto; t: Translate }) {
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
        <dd>{new Date(entry.at).toLocaleString()}</dd>
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

export function AuditLogSection() {
  const { t } = useTranslations({ en, de });
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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [draft, setDraft] = useState<AuditSettingsDto>();
  const [saved, setSaved] = useState(false);
  const parsed = filterRequest(applied);
  const request = { ...parsed.request, beforeId: cursors.at(-1), limit: 50 };
  const activity = useQuery({
    queryKey: ['audit-log', request],
    queryFn: () => AuditService.auditControllerList(request),
    enabled: canRead,
  });
  const settings = useQuery({
    queryKey: ['audit-settings'],
    queryFn: () => SettingsService.settingsControllerGetAuditSettings(),
    enabled: canManage,
  });
  const currentSettings = draft ?? settings.data;
  const saveSettings = useMutation({
    mutationFn: (next: AuditSettingsDto) =>
      SettingsService.settingsControllerUpdateAuditSettings({ requestBody: next }),
    onSuccess: (next) => {
      client.setQueryData(['audit-settings'], next);
      setDraft(undefined);
      setSaved(true);
      void client.invalidateQueries({ queryKey: ['audit-log'] });
    },
  });
  const domainLabel = (domain: string) =>
    Object.hasOwn(en.domains, domain) ? t(`domains.${domain}`) : humanize(domain);
  const updateFilter = (key: keyof AuditFilters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const clearFilters = () => {
    setFilters(emptyFilters);
    setApplied(emptyFilters);
    setCursors([undefined]);
    setFilterError(undefined);
  };
  const applyFilters = () => {
    const result = filterRequest(filters);
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

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold">{t('title')}</h2>
          <p className="text-sm text-muted">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            aria-label={t('refresh')}
            isIconOnly
            isDisabled={!canRead}
            isPending={activity.isFetching}
            onPress={() => {
              setCursors([undefined]);
              void client.invalidateQueries({ queryKey: ['audit-log'] });
            }}
          >
            <RefreshCwIcon size={16} />
          </Button>
          <Button
            variant="outline"
            onPress={exportFiltered}
            isPending={exporting}
            isDisabled={!canRead || activity.isError}
          >
            <DownloadIcon size={16} />
            {exporting ? t('exporting') : t('export')}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <ShieldCheckIcon size={16} className={settings.data?.enabled ? 'text-success' : 'text-muted'} />
        <span>{settings.data ? t(settings.data.enabled ? 'enabled' : 'disabled') : t('unknownSettings')}</span>
        {settings.data && (
          <>
            <span aria-hidden>·</span>
            <span>
              {settings.data.retention_days} {t('retainedDays')}
            </span>
          </>
        )}
      </div>
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
          <form
            className={`space-y-4 ${filtersOpen ? '' : 'hidden md:block'}`}
            onSubmit={(event) => {
              event.preventDefault();
              applyFilters();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
              <AuditSelect
                label={t('domain')}
                value={filters.domain}
                onChange={(value) => updateFilter('domain', value)}
                options={[
                  { value: '', label: t('allDomains') },
                  ...auditDomains.map((domain) => ({ value: domain, label: domainLabel(domain) })),
                ]}
              />
              <TextField value={filters.eventPrefix} onChange={(value) => updateFilter('eventPrefix', value)}>
                <Label>{t('event')}</Label>
                <Input placeholder={t('eventPlaceholder')} />
              </TextField>
              <TextField value={filters.from} onChange={(value) => updateFilter('from', value)} type="datetime-local">
                <Label>{t('from')}</Label>
                <Input />
              </TextField>
              <TextField value={filters.to} onChange={(value) => updateFilter('to', value)} type="datetime-local">
                <Label>{t('to')}</Label>
                <Input />
              </TextField>
            </div>
            {advanced && (
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                <TextField value={filters.actorId} onChange={(value) => updateFilter('actorId', value)}>
                  <Label>{t('actorId')}</Label>
                  <Input inputMode="numeric" placeholder={t('anyId')} />
                </TextField>
                <TextField value={filters.subjectId} onChange={(value) => updateFilter('subjectId', value)}>
                  <Label>{t('targetId')}</Label>
                  <Input inputMode="numeric" placeholder={t('anyId')} />
                </TextField>
                <TextField value={filters.subjectType} onChange={(value) => updateFilter('subjectType', value)}>
                  <Label>{t('targetType')}</Label>
                  <Input placeholder={t('targetTypePlaceholder')} />
                </TextField>
                <AuditSelect
                  label={t('outcome')}
                  value={filters.outcome}
                  onChange={(value) => updateFilter('outcome', value)}
                  options={[
                    { value: '', label: t('allOutcomes') },
                    ...['succeeded', 'failed', 'attempted'].map((value) => ({ value, label: t(`outcomes.${value}`) })),
                  ]}
                />
              </div>
            )}
            {filterError && <Notice title={filterError} />}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary">
                <SearchIcon size={16} />
                {t('search')}
              </Button>
              <Button variant="ghost" onPress={() => setAdvanced(!advanced)} aria-expanded={advanced}>
                <FilterIcon size={16} />
                {t(advanced ? 'fewerFilters' : 'moreFilters')}
              </Button>
              {activeFilterCount > 0 && (
                <Button variant="ghost" onPress={clearFilters}>
                  {t('clear')} ({activeFilterCount})
                </Button>
              )}
            </div>
          </form>
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
              <div className="space-y-3 md:hidden">
                {items.map((entry) => (
                  <Card key={entry.id} variant="secondary">
                    <Card.Header>
                      <div className="flex justify-between gap-3">
                        <Chip size="sm">{domainLabel(entry.domain)}</Chip>
                        <time className="text-xs text-muted" dateTime={entry.at}>
                          {new Date(entry.at).toLocaleString()}
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
                        color={
                          entry.outcome === 'failed' ? 'danger' : entry.outcome === 'succeeded' ? 'success' : 'default'
                        }
                      >
                        {t(`outcomes.${entry.outcome}`)}
                      </Chip>
                    </Card.Footer>
                  </Card>
                ))}
              </div>
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
        {canManage && (
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
                      {auditDomains.map((domain) => (
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
                    onSave={() => saveSettings.mutate(currentSettings)}
                    onDiscard={() => {
                      setDraft(undefined);
                      saveSettings.reset();
                    }}
                  />
                </>
              )
            )}
          </Tabs.Panel>
        )}
      </Tabs>
      <Drawer
        isOpen={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <Drawer.Backdrop>
          <Drawer.Content placement="right">
            <Drawer.Dialog className="w-full max-w-xl">
              <Drawer.CloseTrigger />
              <Drawer.Header>
                <Drawer.Heading>
                  {selected ? auditLabel('events', selected.action, t) : t('eventDetails')}
                </Drawer.Heading>
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
    </div>
  );
}
