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

function setup(loadedPlugins: string[] = []) {
  const resources = repo(['resourceId']);
  const plugins = repo(['resourceId', 'plugin']);
  const readers = repo(['readerId']);
  const audit = { recordAttractap: jest.fn().mockResolvedValue(undefined) };
  const registry = { pluginNames: () => [...loadedPlugins].sort() };
  const service = new ReaderUiSettingsService(
    resources as never,
    plugins as never,
    readers as never,
    audit as never,
    registry as never,
  );
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

  it('lists loaded plugins with the defaults before any setting is stored', async () => {
    const { service } = setup(['b-plugin', 'a-plugin']);
    expect((await service.getResource(1)).plugins).toEqual([
      { plugin: 'a-plugin', widgetsEnabled: true, hookFailurePolicy: 'fail-closed' },
      { plugin: 'b-plugin', widgetsEnabled: true, hookFailurePolicy: 'fail-closed' },
    ]);
  });

  it('rejects settings for a plugin that is not loaded and does not list stored rows of unloaded plugins', async () => {
    const { service, audit } = setup(['res']);
    await expect(
      service.setResource(
        1,
        { noScreenPolicy: null, plugins: [{ plugin: 'gone', widgetsEnabled: false, hookFailurePolicy: 'fail-open' }] },
        9,
      ),
    ).rejects.toThrow('Unknown plugin: gone');
    expect(audit.recordAttractap).not.toHaveBeenCalled();
    expect((await service.getResource(1)).plugins.map((p) => p.plugin)).toEqual(['res']);
  });

  it('audits a first change from the default, not from nothing', async () => {
    const { service, audit } = setup(['res']);
    await service.setResource(
      1,
      { noScreenPolicy: null, plugins: [{ plugin: 'res', widgetsEnabled: true, hookFailurePolicy: 'fail-open' }] },
      9,
    );
    expect(audit.recordAttractap).toHaveBeenCalledTimes(1);
    expect(audit.recordAttractap).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ setting: 'hookFailurePolicy', value: 'fail-open' }),
      }),
    );
  });

  it('stores the override and per-plugin policy, and audits each change once', async () => {
    const { service, audit } = setup(['res']);
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
    const { service, audit } = setup(['res']);
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
