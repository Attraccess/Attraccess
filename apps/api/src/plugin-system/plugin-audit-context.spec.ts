import type { PluginAuditEvent } from '@attraccess/plugins-backend-sdk';
import { createPluginAuditContext, PLUGIN_AUDIT_TIMEOUT_MS } from './plugin-audit-context';

describe('plugin audit host bridge', () => {
  const event: PluginAuditEvent = {
    action: 'wago.claim', operationId: 'operation-id', outcome: 'succeeded',
    principal: { userId: 7, authenticationMethod: 'session' },
    subject: { type: 'wago.controller', id: 2 }, details: {},
  };

  it('uses the host manifest identity and returns the durable sink receipt', async () => {
    const record = jest.fn(async () => ({ status: 'recorded' as const }));
    const audit = createPluginAuditContext('host-plugin-id', () => ({ record }));
    await expect(audit.record({ ...event, pluginId: 'spoofed' } as PluginAuditEvent)).resolves.toEqual({ status: 'recorded' });
    expect(record).toHaveBeenCalledWith({ ...event, pluginId: 'host-plugin-id' });
  });

  it('reports missing foundation and storage failures as unavailable', async () => {
    const missing = createPluginAuditContext('id', () => { throw new Error('provider missing'); });
    const failing = createPluginAuditContext('id', () => ({ record: async () => { throw new Error('secret storage error'); } }));
    await expect(missing.record(event)).resolves.toEqual({ status: 'unavailable' });
    await expect(failing.record(event)).resolves.toEqual({ status: 'unavailable' });
  });

  it('bounds stalled storage writes so they cannot stall plugin operations', async () => {
    jest.useFakeTimers();
    try {
      const audit = createPluginAuditContext('id', () => ({ record: async () => new Promise(() => undefined) }));
      const receipt = audit.record(event);
      await jest.advanceTimersByTimeAsync(PLUGIN_AUDIT_TIMEOUT_MS);
      await expect(receipt).resolves.toEqual({ status: 'unavailable' });
    } finally {
      jest.useRealTimers();
    }
  });
});
