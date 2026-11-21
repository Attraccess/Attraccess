import {
  ApiError,
  AuditEntryDto,
  AuditControllerListData,
  AuditPageDto,
  AuditQueryDtoSchema,
  AuditSettingsDtoSchema,
  AuditMetaDto,
  AuditSettingsDto,
} from '@attraccess/react-query-client';
import { getApiErrorMessage } from '../../../../utils/apiError';

export type AuditDomain = AuditSettingsDto['domains'][number];

/** Query parameters of the audit list endpoint. */
export type AuditListQuery = NonNullable<AuditControllerListData['query']>;

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

export function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

/** Locale-aware label from a plugin's declaration; callers fall back to i18n keys or humanize(). */
export function pluginDomainLabel(labels: Record<string, string> | undefined, language: string): string | undefined {
  if (!labels) return undefined;
  return labels[language] ?? labels[language?.slice(0, 2)] ?? labels.en;
}

/** Domains contributed by loaded plugins; the core UI never hardcodes a plugin domain. */
export function pluginDomains(meta: AuditMetaDto | undefined) {
  return meta?.domains.filter((domain) => domain.source === 'plugin') ?? [];
}

export function snapshot(value: unknown): Record<string, unknown> {
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

export function toggleDomain(domains: AuditDomain[], domain: AuditDomain, selected: boolean): AuditDomain[] {
  return selected ? [...new Set([...domains, domain])] : domains.filter((value) => value !== domain);
}

/** Plugin domains record while registered unless disabled; toggling edits the blocklist. */
export function togglePluginDomain(disabled: string[], domain: string, selected: boolean): string[] {
  return selected ? disabled.filter((value) => value !== domain) : [...new Set([...disabled, domain])];
}

/** Audit domains owned by the core app. Plugin domains arrive through the audit meta endpoint. */
export const coreAuditDomains = AuditSettingsDtoSchema.properties.domains.items.enum;

export const eventPrefix = new RegExp(AuditQueryDtoSchema.properties.eventPrefix.pattern);

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

export const subjectTypePattern = new RegExp(AuditQueryDtoSchema.properties.subjectType.pattern);

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
      'Actor username',
      'Actor username source',
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
      row.actorDisplayName ?? row.actorUsername,
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
  request: AuditListQuery,
  loadPage: (request: AuditListQuery) => Promise<AuditPageDto>,
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

/** Vocabulary the API validates free-text filters against; undefined until the meta endpoint loaded. */
export type AuditFilterVocabulary = {
  subjectTypes?: readonly string[];
  eventPrefixes?: readonly string[];
};

/** Leading action segments, the same list the API checks an eventPrefix against. */
export function knownEventPrefixes(actions: readonly string[]): string[] {
  return [...new Set(actions.map((action) => action.split('.')[0]))];
}

export function filterVocabulary(meta: AuditMetaDto | undefined): AuditFilterVocabulary {
  return meta ? { subjectTypes: meta.subjectTypes, eventPrefixes: knownEventPrefixes(meta.actions) } : {};
}

/** The API rejected the event prefix, e.g. a plugin domain that was unloaded after meta loaded. */
export function rejectsEventPrefix(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400 && getApiErrorMessage(error).includes('eventPrefix');
}

function validEventPrefix(prefix: string, eventPrefixes: readonly string[] | undefined): boolean {
  if (prefix.length > AuditQueryDtoSchema.properties.eventPrefix.maxLength || !eventPrefix.test(prefix)) return false;
  // Once meta loaded, the leading segment must be a known one, as the API requires.
  return !eventPrefixes || eventPrefixes.includes(prefix.split('.')[0]);
}

export function filterRequest(
  filters: AuditFilters,
  { subjectTypes, eventPrefixes }: AuditFilterVocabulary = {},
): { request: AuditListQuery; error?: never } | { error: string; request?: never } {
  const request: AuditListQuery = {};
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
  if (prefix && !validEventPrefix(prefix, eventPrefixes)) return { error: 'invalidEventPrefix' };
  if (prefix) request.eventPrefix = prefix;
  const subjectType = filters.subjectType.trim();
  if (subjectType) {
    // Validate against the live vocabulary once meta loaded; otherwise fall back to the API shape.
    const known = subjectTypes ? subjectTypes.includes(subjectType) : subjectTypePattern.test(subjectType);
    if (!known) return { error: 'invalidSubjectType' };
  }
  if (subjectType) request.subjectType = subjectType;
  const domain = filters.domain.trim();
  if (domain) request.domain = domain;
  // The outcome select only offers the API's enum values.
  const outcome = filters.outcome.trim();
  if (outcome) request.outcome = outcome as typeof request.outcome;
  return { request };
}
