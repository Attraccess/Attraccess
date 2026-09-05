import type { PluginAuditEvent } from '@attraccess/plugins-backend-sdk';
import { createPluginAuditContext } from './plugin-audit-context';

describe('plugin audit host bridge', () => {
  const event: PluginAuditEvent = {
    action: 'wago.claim',
    operationId: 'operation-id',
    outcome: 'succeeded',
    principal: { userId: 7, authenticationMethod: 'session' },
    subject: { type: 'wago.controller', id: 2 },
    details: {},
  };

  it('uses the host manifest identity and returns the durable sink receipt', async () => {
    const record = jest.fn(async () => ({ status: 'recorded' as const }));
    const audit = createPluginAuditContext('host-plugin-id', () => ({ record }));
    await expect(audit.record({ ...event, pluginId: 'spoofed' } as PluginAuditEvent)).resolves.toEqual({
      status: 'recorded',
    });
    expect(record).toHaveBeenCalledWith({ ...event, pluginId: 'host-plugin-id' });
  });

  it('reports missing foundation and storage failures as unavailable', async () => {
    const missing = createPluginAuditContext('id', () => {
      throw new Error('provider missing');
    });
    const failing = createPluginAuditContext('id', () => ({
      record: async () => {
        throw new Error('secret storage error');
      },
    }));
    await expect(missing.record(event)).resolves.toEqual({ status: 'unavailable' });
    await expect(failing.record(event)).resolves.toEqual({ status: 'unavailable' });
  });
  it('bounds a nonsettling provider without retrying or exposing the event', async () => {
    jest.useFakeTimers();
    try {
      const record = jest.fn(() => new Promise<never>(() => undefined));
      const pending = createPluginAuditContext('id', () => ({ record })).record(event);
      await jest.advanceTimersByTimeAsync(1000);
      await expect(pending).resolves.toEqual({ status: 'unavailable' });
      expect(record).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
