import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  AuditEntryDto,
  AuditService,
  AuditSettingsDto,
  useAuditServiceAuditControllerList,
  useAuditServiceAuditControllerMeta,
  useSettingsServiceSettingsControllerGetAuditSettings,
  useSettingsServiceSettingsControllerUpdateAuditSettings,
  UseAuditServiceAuditControllerListKeyFn,
  UseSettingsServiceSettingsControllerGetAuditSettingsKeyFn,
} from '@attraccess/react-query-client';
import { useAuth } from '../../../../hooks/useAuth';
import {
  auditCsv,
  AuditFilters,
  emptyFilters,
  exportAuditEntries,
  filterRequest,
  humanize,
  pluginDomainLabel,
  pluginDomains,
} from './audit-log-model';
import en from './en.json';
import de from './de.json';

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
    setFilters(emptyFilters);
    setApplied(emptyFilters);
    setCursors([undefined]);
    setFilterError(undefined);
  };
  const applyFilters = () => {
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
