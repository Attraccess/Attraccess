import { describe, expect, it, vi } from 'vitest';
import type { AuditEntryDto, AuditMetaDto } from '@attraccess/react-query-client';
import {
  auditCsv,
  changes,
  csvCell,
  emptyFilters,
  exportAuditEntries,
  filterRequest,
  pluginDomainLabel,
  pluginDomains,
  togglePluginDomain,
} from './audit-log-model';

const entry: AuditEntryDto = {
  id: 10,
  at: '2026-09-13T12:00:00Z',
  domain: 'resource',
  pluginId: 'core',
  action: 'resource.updated',
  operationId: 'op',
  actorId: null,
  authenticationMethod: null,
  apiTokenId: null,
  outcome: 'succeeded',
  subjectType: 'resource',
  subjectId: 2,
  details: {},
};

describe('audit export and filtering', () => {
  it('exports the entire applied filter from the newest page, independently of the viewed cursor', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ items: [entry], nextCursor: 10 })
      .mockResolvedValueOnce({ items: [{ ...entry, id: 9 }], nextCursor: null });
    const result = await exportAuditEntries({ domain: 'resource', actorId: 7, beforeId: 5 }, load);
    expect(result.map((row) => row.id)).toEqual([10, 9]);
    expect(load.mock.calls.map(([query]) => query)).toEqual([
      { domain: 'resource', actorId: 7, beforeId: undefined, limit: 100 },
      { domain: 'resource', actorId: 7, beforeId: 10, limit: 100 },
    ]);
  });
  it('fails a repeated export cursor instead of looping forever', async () => {
    await expect(exportAuditEntries({}, vi.fn().mockResolvedValue({ items: [entry], nextCursor: 10 }))).rejects.toThrow(
      'Invalid audit cursor',
    );
  });
  it('preserves full details and protects spreadsheet cells from formula injection', () => {
    expect(csvCell(' =HYPERLINK("https://example.test")')).toBe('"\' =HYPERLINK(""https://example.test"")"');
    expect(csvCell('value, "quoted"')).toBe('"value, ""quoted"""');
    const csv = auditCsv([
      { ...entry, subjectLabel: '=1+1', details: { before: '{"name":"old"}', after: '{"name":"new"}' } },
    ]);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain('old');
    expect(csv).toContain('new');
  });
  it('rejects reversed dates and unsafe IDs without throwing', () => {
    expect(filterRequest({ ...emptyFilters, from: '2026-09-13T12:00', to: '2026-09-12T12:00' })).toEqual({
      error: 'invalidRange',
    });
    expect(filterRequest({ ...emptyFilters, actorId: '9007199254740992' })).toEqual({ error: 'invalidId' });
    expect(filterRequest({ ...emptyFilters, from: 'invalid' })).toEqual({ error: 'invalidDate' });
  });
  it('rejects unsupported free-text filters before they can be applied', () => {
    const subjectTypes = ['billing.transaction', 'resource'];
    expect(filterRequest({ ...emptyFilters, eventPrefix: 'resource..updated' })).toEqual({
      error: 'invalidEventPrefix',
    });
    expect(filterRequest({ ...emptyFilters, subjectType: 'transaction' }, subjectTypes)).toEqual({
      error: 'invalidSubjectType',
    });
    expect(filterRequest({ ...emptyFilters, eventPrefix: 'billing.transaction.' })).toEqual({
      request: { eventPrefix: 'billing.transaction.' },
    });
    expect(filterRequest({ ...emptyFilters, subjectType: 'billing.transaction' }, subjectTypes)).toEqual({
      request: { subjectType: 'billing.transaction' },
    });
  });
  it('accepts plugin subject types from meta and falls back to the API shape', () => {
    expect(filterRequest({ ...emptyFilters, subjectType: 'demo.device' }, ['demo.device'])).toEqual({
      request: { subjectType: 'demo.device' },
    });
    expect(filterRequest({ ...emptyFilters, subjectType: 'demo.device' })).toEqual({
      request: { subjectType: 'demo.device' },
    });
    expect(filterRequest({ ...emptyFilters, subjectType: 'Demo..Device' })).toEqual({ error: 'invalidSubjectType' });
  });
  it('exposes plugin-contributed domains and localized labels from meta only', () => {
    const meta: AuditMetaDto = {
      domains: [
        { id: 'resource', source: 'core' },
        { id: 'demo', source: 'plugin', labels: { en: 'Demo devices', de: 'Demo-Geräte' } },
      ],
      subjectTypes: ['resource', 'demo.device'],
      actions: ['resource.updated', 'demo.publication'],
    };
    expect(pluginDomains(meta)).toEqual([{ id: 'demo', source: 'plugin', labels: { en: 'Demo devices', de: 'Demo-Geräte' } }]);
    expect(pluginDomains(undefined)).toEqual([]);
    expect(pluginDomainLabel(pluginDomains(meta)[0].labels, 'de')).toBe('Demo-Geräte');
    expect(pluginDomainLabel(pluginDomains(meta)[0].labels, 'en')).toBe('Demo devices');
    expect(pluginDomainLabel(undefined, 'en')).toBeUndefined();
  });
  it('toggles plugin domains through the disabled blocklist', () => {
    expect(togglePluginDomain([], 'demo', false)).toEqual(['demo']);
    expect(togglePluginDomain(['demo'], 'demo', false)).toEqual(['demo']);
    expect(togglePluginDomain(['demo', 'other'], 'demo', true)).toEqual(['other']);
  });
  it('renders old malformed snapshots without dropping their recorded value', () => {
    expect(changes({ ...entry, details: { before: '{"truncated":', after: '{"valid":true}' } })).toEqual([
      { field: 'value', before: '{"truncated":', after: undefined },
      { field: 'valid', before: undefined, after: true },
    ]);
  });
  it('compares the scalar before and after summaries emitted by plugins', () => {
    expect(
      changes({
        ...entry,
        details: {
          'before.channelCount': 2,
          'after.channelCount': 3,
          'before.pointCount': 4,
          'after.pointCount': 4,
        },
      }),
    ).toEqual([{ field: 'channelCount', before: 2, after: 3 }]);
  });
  it('shows explicitly recorded changed fields when snapshots are absent or partial', () => {
    expect(changes({ ...entry, details: { changedFields: '["name","enabled"]', 'after.enabled': 0 } })).toEqual([
      { field: 'enabled', before: undefined, after: 0 },
      { field: 'name', before: undefined, after: undefined },
    ]);
  });
});
