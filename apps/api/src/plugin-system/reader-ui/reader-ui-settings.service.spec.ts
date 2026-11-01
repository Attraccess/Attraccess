/* eslint-disable @typescript-eslint/no-explicit-any */
import { ReaderUiSettingsService } from './reader-ui-settings.service';

function repo<T extends Record<string, any>>(keys: string[]) {
  const rows: T[] = [];
  const matches = (row: any, where: any) => Object.entries(where).every(([k, v]) => row[k] === v);
  return {
    rows,
    findOne: jest.fn(async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null),
    find: jest.fn(async ({ where }: any) => rows.filter((r) => matches(r, where))),
    save: jest.fn(async (x: any) => {
      const existing = rows.find((r) => keys.every((k) => (r as any)[k] === x[k]));
      if (existing) Object.assign(existing, x);
      else rows.push(x);
      return x;
    }),
  };
}

function setup() {
  const resources = repo(['resourceId']);
  const plugins = repo(['resourceId', 'plugin']);
  const readers = repo(['readerId']);
  const audit = { recordAttractap: jest.fn().mockResolvedValue(undefined) };
  const service = new ReaderUiSettingsService(resources as never, plugins as never, readers as never, audit as never);
  return { service, audit };
}

describe('ReaderUiSettingsService', () => {
  it('defaults to no override, fail-closed and widgets on', async () => {
    const { service } = setup();
    expect(await service.getResource(1)).toEqual({ noScreenPolicy: null, plugins: [] });
    expect(await service.failurePolicy(1, 'p')).toBe('fail-closed');
    expect(await service.noScreenPolicyOverride(1)).toBeNull();
    expect(await service.widgetsEnabled(1, 'p', 2)).toBe(true);
    expect(await service.getReader(2)).toEqual({ widgetsEnabled: true });
  });

  it('stores the override and per-plugin policy, and audits each change once', async () => {
    const { service, audit } = setup();
    const next = {
      noScreenPolicy: 'card-confirm' as const,
      plugins: [{ plugin: 'res', widgetsEnabled: false, hookFailurePolicy: 'fail-open' as const }],
    };
    await service.setResource(1, next, 9);
    expect(await service.getResource(1)).toEqual(next);
    expect(await service.noScreenPolicyOverride(1)).toBe('card-confirm');
    expect(await service.failurePolicy(1, 'res')).toBe('fail-open');
    expect(audit.recordAttractap).toHaveBeenCalledTimes(3);
    expect(audit.recordAttractap).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ui.setting_changed',
        actorId: 9,
        details: expect.objectContaining({ setting: 'hookFailurePolicy', plugin: 'res', value: 'fail-open' }),
      }),
    );
    audit.recordAttractap.mockClear();
    await service.setResource(1, next, 9);
    expect(audit.recordAttractap).not.toHaveBeenCalled();
  });

  it('shows widgets only when the resource and the reader toggle are both on', async () => {
    const { service, audit } = setup();
    await service.setResource(
      1,
      { noScreenPolicy: null, plugins: [{ plugin: 'res', widgetsEnabled: true, hookFailurePolicy: 'fail-closed' }] },
      9,
    );
    expect(await service.widgetsEnabled(1, 'res', 2)).toBe(true);
    await service.setReader(2, false, 9);
    expect(await service.widgetsEnabled(1, 'res', 2)).toBe(false);
    expect(await service.widgetsEnabled(1, 'res', 3)).toBe(true);
    expect(audit.recordAttractap).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.objectContaining({ setting: 'readerWidgetsEnabled', readerId: 2 }) }),
    );
  });

  it('does not fail the save when auditing fails', async () => {
    const { service, audit } = setup();
    audit.recordAttractap.mockRejectedValue(new Error('down'));
    await expect(service.setReader(2, false, 9)).resolves.toBeUndefined();
  });
});
