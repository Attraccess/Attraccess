import { AuditEntryDto } from '@attraccess/react-query-client';
import { snapshot } from './audit-log-model.humanize.helpers';
import { AuditControllerListData } from '@attraccess/react-query-client';
import { AuditPageDto } from '@attraccess/react-query-client';
import { $AuditQueryDto } from '@attraccess/react-query-client';
import type { AuditFilters } from './audit-log-model.contracts';
import { eventPrefix } from './audit-log-model.state';
import { subjectTypePattern } from './audit-log-model.state';
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
      'Actor name source',
      'Authentication method',
      'API token ID',
      'Integration ID',
      'IP address',
      'User agent',
      'Target type',
      'Target ID',
      'Target',
      'Target name source',
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
      row.actorUsernameSource,
      row.authenticationMethod,
      row.apiTokenId,
      row.pluginId,
      row.ipAddress,
      row.userAgent,
      row.subjectType,
      row.subjectId,
      row.subjectLabel,
      row.subjectLabelSource,
      row.operationId,
      row.details,
    ]);
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
export function flatSnapshot(value: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, field]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return field !== null && typeof field === 'object' && !Array.isArray(field) && Object.keys(field).length
        ? Object.entries(flatSnapshot(field as Record<string, unknown>, path))
        : [[path, field]];
    }),
  );
}

export function changes(entry: AuditEntryDto) {
  const before = flatSnapshot(snapshot(entry.details.before));
  const after = flatSnapshot(snapshot(entry.details.after));
  // Plugin summary events store safe scalar changes as before.field / after.field.
  for (const [key, value] of Object.entries(entry.details)) {
    if (key.startsWith('before.')) before[key.slice(7)] = value;
    if (key.startsWith('after.')) after[key.slice(6)] = value;
  }
  let changedFields: string[] = [];
  try {
    const fields = JSON.parse(String(entry.details.changedFields));
    if (Array.isArray(fields) && fields.every((field) => typeof field === 'string' && field.length > 0))
      changedFields = fields;
  } catch {
    /* The original value remains visible in recorded details. */
  }
  return [...new Set([...Object.keys(before), ...Object.keys(after), ...changedFields])]
    .filter((field) => changedFields.includes(field) || JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({ field, before: before[field], after: after[field] }));
}
export function displayValue(value: unknown): string {
  if (typeof value === 'string' && /^\s*[[{]/.test(value)) {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      /* Retain malformed historical values. */
    }
  }
  return value === undefined || value === null
    ? '—'
    : typeof value === 'object'
      ? JSON.stringify(value, null, 2)
      : String(value);
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

export function filterRequest(
  filters: AuditFilters,
  subjectTypes?: readonly string[],
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
  const prefix = filters.eventPrefix.trim();
  if (prefix && (prefix.length > $AuditQueryDto.properties.eventPrefix.maxLength || !eventPrefix.test(prefix)))
    return { error: 'invalidEventPrefix' };
  if (prefix) request.eventPrefix = prefix;
  const subjectType = filters.subjectType.trim();
  if (subjectType) {
    // Validate against the live vocabulary once meta loaded; otherwise fall back to the API shape.
    const known = subjectTypes ? subjectTypes.includes(subjectType) : subjectTypePattern.test(subjectType);
    if (!known) return { error: 'invalidSubjectType' };
  }
  if (subjectType) request.subjectType = subjectType;
  for (const key of ['domain', 'outcome'] as const) {
    if (filters[key].trim()) request[key] = filters[key].trim();
  }
  return { request };
}
