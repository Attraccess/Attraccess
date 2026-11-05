import { PluginPermission, PluginPermissionError, type PluginContext } from '@attraccess/plugins-backend-sdk';
import { collectReaderUiContributions } from './reader-ui-load';

const ctx = {} as PluginContext;
const provider = { getSlotContributions: () => [] };
const hook = () => ({ decision: 'allow' as const });

describe('collectReaderUiContributions', () => {
  it('returns null when nothing is contributed', () => {
    expect(collectReaderUiContributions('p', [], { register: jest.fn() }, ctx)).toBeNull();
  });

  it('rejects a readerUi provider without READER_UI', () => {
    expect(() => collectReaderUiContributions('p', [], { readerUi: provider }, ctx)).toThrow(PluginPermissionError);
  });

  it.each(['preStartHook', 'sessionEndHook'] as const)('rejects %s without ACCESS_HOOKS', (field) => {
    expect(() =>
      collectReaderUiContributions('p', [PluginPermission.READER_UI], { [field]: hook }, ctx),
    ).toThrow(PluginPermissionError);
  });

  it('collects provider factories and hooks when permitted', () => {
    const out = collectReaderUiContributions(
      'p',
      [PluginPermission.READER_UI, PluginPermission.ACCESS_HOOKS],
      { readerUi: () => provider, preStartHook: hook, sessionEndHook: () => ({ decision: 'none' }) },
      ctx,
    );
    expect(out?.readerUi).toBe(provider);
    expect(out?.preStartHook).toBe(hook);
    expect(out?.sessionEndHook).toBeDefined();
  });
});
