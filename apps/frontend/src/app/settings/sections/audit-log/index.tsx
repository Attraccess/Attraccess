import { Button, NumberField, NumberFieldGroup, NumberFieldInput, Spinner, Switch, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadIcon } from 'lucide-react';
import { useState } from 'react';
import { AuditService, SettingsService } from '@attraccess/react-query-client';
import { useAuth } from '../../../../hooks/useAuth';
import { SettingsSection } from '../../components/SettingsSection';
import { SettingsRow } from '../../components/SettingsRow';
import { SettingsSaveBar } from '../../components/SettingsSaveBar';

type AuditEntry = {
  id: number;
  at: string;
  domain: string;
  action: string;
  actorId: number;
  subjectId: number;
  subjectType: string;
  details: Record<string, string | number>;
};

type Filters = { domain: string; eventPrefix: string; actorId: string; subjectId: string; from: string; to: string };
const initialFilters: Filters = { domain: '', eventPrefix: '', actorId: '', subjectId: '', from: '', to: '' };

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export function AuditLogSection() {
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const [filters, setFilters] = useState(initialFilters);
  const [beforeId, setBeforeId] = useState<number | undefined>();
  const [history, setHistory] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const canManage = hasPermission('system.settings.manage');

  const request = {
    domain: filters.domain || undefined,
    eventPrefix: filters.eventPrefix || undefined,
    actorId: filters.actorId ? Number(filters.actorId) : undefined,
    subjectId: filters.subjectId ? Number(filters.subjectId) : undefined,
    from: filters.from ? new Date(filters.from).toISOString() : undefined,
    to: filters.to ? new Date(filters.to).toISOString() : undefined,
    beforeId,
    limit: 50 as never,
  };
  const { data, isLoading } = useQuery({ queryKey: ['audit-log', request], queryFn: () => AuditService.auditControllerList(request) });
  const settings = useQuery({ queryKey: ['audit-settings'], queryFn: () => SettingsService.settingsControllerGetAuditSettings(), enabled: canManage });
  const [draft, setDraft] = useState<{ enabled: boolean; domains: 'wago'[]; retention_days: number } | undefined>();
  const currentSettings = draft ?? settings.data;
  const saveSettings = useMutation({
    mutationFn: () => SettingsService.settingsControllerUpdateAuditSettings({ requestBody: draft }),
    onSuccess: (next) => { client.setQueryData(['audit-settings'], next); setDraft(undefined); },
  });

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setBeforeId(undefined);
    setHistory([]);
  };
  const exportFiltered = async () => {
    setExporting(true);
    try {
      const rows: AuditEntry[] = [];
      let cursor: number | undefined;
      do {
        const page = await AuditService.auditControllerList({ ...request, beforeId: cursor, limit: 100 as never });
        rows.push(...((page as unknown as { items: AuditEntry[] }).items));
        cursor = (page as unknown as { nextCursor: number | null }).nextCursor ?? undefined;
      } while (cursor);
      const csv = [['Date', 'Domain', 'Event', 'Actor', 'Target', 'Changed fields'], ...rows.map((row) => [row.at, row.domain, row.action, row.actorId, `${row.subjectType}:${row.subjectId}`, Object.keys(row.details).join(', ')])]
        .map((row) => row.map(csvCell).join(','))
        .join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'audit-log.csv';
      link.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  return <SettingsSection title="Audit log" description="Search administrative activity and configure how long it is retained.">
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <input aria-label="Domain" value={filters.domain} onChange={(event) => updateFilter('domain', event.target.value)} placeholder="Domain (wago)" className="rounded-medium border border-default-200 bg-content1 px-3 py-2" />
        <input aria-label="Event" value={filters.eventPrefix} onChange={(event) => updateFilter('eventPrefix', event.target.value)} placeholder="Event prefix" className="rounded-medium border border-default-200 bg-content1 px-3 py-2" />
        <input aria-label="Actor" value={filters.actorId} onChange={(event) => updateFilter('actorId', event.target.value)} placeholder="Actor ID" inputMode="numeric" className="rounded-medium border border-default-200 bg-content1 px-3 py-2" />
        <input aria-label="Target" value={filters.subjectId} onChange={(event) => updateFilter('subjectId', event.target.value)} placeholder="Target ID" inputMode="numeric" className="rounded-medium border border-default-200 bg-content1 px-3 py-2" />
        <input aria-label="From date" type="datetime-local" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} className="rounded-medium border border-default-200 bg-content1 px-3 py-2" />
        <input aria-label="To date" type="datetime-local" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} className="rounded-medium border border-default-200 bg-content1 px-3 py-2" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onPress={() => { setFilters(initialFilters); setBeforeId(undefined); setHistory([]); }}>Clear filters</Button>
        <Button variant="primary" onPress={exportFiltered} isPending={exporting}><DownloadIcon className="size-4" />Export CSV</Button>
      </div>
      {isLoading ? <Spinner /> : <Table aria-label="Audit log"><TableHeader><TableColumn>Date</TableColumn><TableColumn>Domain</TableColumn><TableColumn>Event</TableColumn><TableColumn>Actor</TableColumn><TableColumn>Target</TableColumn></TableHeader><TableBody>{((data as unknown as { items?: AuditEntry[] })?.items ?? []).map((entry) => <TableRow key={entry.id} onAction={() => setExpanded(expanded === entry.id ? null : entry.id)}><TableCell>{new Date(entry.at).toLocaleString()}</TableCell><TableCell>{entry.domain}</TableCell><TableCell>{entry.action}</TableCell><TableCell>{entry.actorId}</TableCell><TableCell>{entry.subjectType}:{entry.subjectId}{expanded === entry.id && <pre className="mt-2 max-w-md overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(entry.details, null, 2)}</pre>}</TableCell></TableRow>)}</TableBody></Table>}
      <div className="flex justify-between"><Button variant="outline" isDisabled={!history.length} onPress={() => { const previous = history.at(-1); setHistory((items) => items.slice(0, -1)); setBeforeId(previous); }}>Previous</Button><Button variant="outline" isDisabled={!(data as unknown as { nextCursor?: number | null })?.nextCursor} onPress={() => { setHistory((items) => [...items, beforeId ?? 0]); setBeforeId((data as unknown as { nextCursor: number }).nextCursor); }}>Next</Button></div>
    </div>
    {canManage && currentSettings && <><div className="mt-8"><SettingsRow label="Enable audit logging" hint="Disable all audit writes globally."><Switch isSelected={currentSettings.enabled} onChange={(enabled) => setDraft({ ...currentSettings, enabled })}><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch></SettingsRow><SettingsRow label="Audit WAGO activity" hint="Choose which domains can create audit records."><Switch isSelected={currentSettings.domains.includes('wago')} onChange={(selected) => setDraft({ ...currentSettings, domains: selected ? ['wago'] : [] })}><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch></SettingsRow><SettingsRow label="Retention period" hint="Audit entries older than this are deleted."><NumberField value={currentSettings.retention_days} minValue={1} maxValue={3650} onChange={(retention_days) => setDraft({ ...currentSettings, retention_days })}><NumberFieldGroup><NumberFieldInput /></NumberFieldGroup></NumberField></SettingsRow></div><SettingsSaveBar isDirty={!!draft} isSaving={saveSettings.isPending} onSave={() => saveSettings.mutate()} onDiscard={() => setDraft(undefined)} /></>}
  </SettingsSection>;
}
