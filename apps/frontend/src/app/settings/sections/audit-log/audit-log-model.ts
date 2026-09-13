import {
  $AuditSettingsDto,
  AuditControllerListData,
  AuditEntryDto,
  AuditPageDto,
  AuditSettingsDto,
} from '@attraccess/react-query-client';

export const auditDomains = $AuditSettingsDto.properties.domains.items.enum;
export type AuditDomain = AuditSettingsDto['domains'][number];
export type AuditFilters = {
  domain: string;
  eventPrefix: string;
  actorId: string;
  subjectId: string;
  subjectType: string;
  outcome: string;
  from: string;
  to: string;
};
export const emptyFilters: AuditFilters = {
  domain: '',
  eventPrefix: '',
  actorId: '',
  subjectId: '',
  subjectType: '',
  outcome: '',
  from: '',
  to: '',
};

export function filterRequest(
  filters: AuditFilters,
): { request: AuditControllerListData; error?: never } | { error: string; request?: never } {
  const request: AuditControllerListData = {};
  for (const key of ['actorId', 'subjectId'] as const) {
    if (!filters[key].trim()) continue;
    const value = Number(filters[key]);
    if (!/^\d+$/.test(filters[key]) || !Number.isSafeInteger(value) || value < 1) return { error: 'invalidId' };
    request[key] = value;
  }
  for (const key of ['from', 'to'] as const) {
    if (!filters[key]) continue;
    const date = new Date(filters[key]);
    if (Number.isNaN(date.getTime())) return { error: 'invalidDate' };
    request[key] = date.toISOString();
  }
  if (request.from && request.to && request.from > request.to) return { error: 'invalidRange' };
  for (const key of ['domain', 'eventPrefix', 'subjectType', 'outcome'] as const) {
    if (filters[key].trim()) request[key] = filters[key].trim();
  }
  return { request };
}

export function toggleDomain(domains: AuditDomain[], domain: AuditDomain, selected: boolean): AuditDomain[] {
  return selected ? [...new Set([...domains, domain])] : domains.filter((value) => value !== domain);
}

export function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function snapshot(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value === 'string') {
    try {
      return snapshot(JSON.parse(value));
    } catch {
      return { value };
    }
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { value };
}

export function changes(entry: AuditEntryDto) {
  const before = snapshot(entry.details.before);
  const after = snapshot(entry.details.after);
  // WAGO summary events store safe scalar changes as before.field / after.field.
  for (const [key, value] of Object.entries(entry.details)) {
    if (key.startsWith('before.')) before[key.slice(7)] = value;
    if (key.startsWith('after.')) after[key.slice(6)] = value;
  }
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({ field, before: before[field], after: after[field] }));
}

export function displayValue(value: unknown): string {
  return value === undefined || value === null
    ? '—'
    : typeof value === 'object'
      ? JSON.stringify(value, null, 2)
      : String(value);
}

export function csvCell(value: unknown): string {
  const text =
    value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Quoting CSV syntax alone does not prevent spreadsheet formula execution.
  const safe = /^[\s]*[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function auditCsv(entries: AuditEntryDto[]): string {
  const rows: unknown[][] = [
    [
      'ID',
      'Date',
      'Domain',
      'Event',
      'Outcome',
      'Actor ID',
      'Actor',
      'Target type',
      'Target ID',
      'Target',
      'Operation ID',
      'Details',
    ],
  ];
  for (const row of entries)
    rows.push([
      row.id,
      row.at,
      row.domain,
      row.action,
      row.outcome,
      row.actorId,
      row.actorUsername,
      row.subjectType,
      row.subjectId,
      row.subjectLabel,
      row.operationId,
      row.details,
    ]);
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export async function exportAuditEntries(
  request: AuditControllerListData,
  loadPage: (request: AuditControllerListData) => Promise<AuditPageDto>,
): Promise<AuditEntryDto[]> {
  const entries: AuditEntryDto[] = [];
  let beforeId: number | undefined;
  do {
    const page = await loadPage({ ...request, beforeId, limit: 100 });
    entries.push(...page.items);
    if (page.nextCursor === null) return entries;
    if (
      !Number.isSafeInteger(page.nextCursor) ||
      page.nextCursor < 1 ||
      (beforeId !== undefined && page.nextCursor >= beforeId)
    )
      throw new Error('Invalid audit cursor');
    beforeId = page.nextCursor;
  } while (beforeId);
  return entries;
}
