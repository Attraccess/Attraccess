import type { AuthenticatedRequest, PluginAuditEvent, PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { WAGO_AUDIT_ACTIONS, WagoAudit, wagoAuditDetails, wagoAuditPrincipal, wagoAuditSummary } from './wago-audit';

const principal: PluginAuditPrincipal = { userId: 7, authenticationMethod: 'api-token', apiTokenId: 9 };

describe('WAGO audit lifecycles', () => {
  const record = jest.fn<Promise<{ status: 'recorded' }>, [PluginAuditEvent]>(async () => ({ status: 'recorded' }));
  const warn = jest.fn();
  const audit = new WagoAudit({ audit: { record }, logger: { log: jest.fn(), error: jest.fn(), warn } });
  beforeEach(() => jest.clearAllMocks());

  it.each(WAGO_AUDIT_ACTIONS)('records %s attempt and completion with the same principal and operation ID', async (action) => {
    const result = { revision: 4, password: 'SECRET', payload: { unsafe: 'SECRET' } };
    await expect(audit.run(principal, 12, action, {}, async () => result, (value) => ({ revision: value.revision }))).resolves.toBe(result);
    const [attempt, success] = record.mock.calls.map(([event]) => event);
    expect(attempt).toEqual({
      action: `wago.${action}`, operationId: expect.any(String), principal,
      subject: { type: 'wago.controller', id: 12 }, outcome: 'attempted', details: {},
    });
    expect(success).toEqual({ ...attempt, outcome: 'succeeded', details: { revision: 4 } });
    expect(JSON.stringify(record.mock.calls)).not.toContain('SECRET');
  });

  it.each(WAGO_AUDIT_ACTIONS)('records %s failures without copying arbitrary errors', async (action) => {
    const error = new Error('SECRET mqtt://user:password@broker payload');
    await expect(audit.run(principal, 12, action, {}, async () => { throw error; })).rejects.toBe(error);
    expect(record.mock.calls.map(([event]) => event.outcome)).toEqual(['attempted', 'failed']);
    expect(JSON.stringify(record.mock.calls)).not.toContain('SECRET');
  });

  it('retains manual dispatch identity until the actual acknowledgement and finishes once', async () => {
    const commandId = '9c53280c-01cd-4f67-8a40-23d9f1ffecfe';
    const lifecycle = audit.begin(principal, 12, 'manual_command', { channelId: 'lock-a', operation: 'pulse', commandId });
    await Promise.all([lifecycle.attempt(), lifecycle.attempt()]);
    expect(record).toHaveBeenCalledTimes(1);
    await Promise.all([lifecycle.finish('succeeded', { result: 'acknowledged' }), lifecycle.finish('failed', { result: 'timeout' })]);
    expect(record).toHaveBeenCalledTimes(2);
    expect(record.mock.calls[1][0].details).toEqual({ channelId: 'lock-a', operation: 'pulse', commandId, result: 'acknowledged' });
  });

  it('captures primitive identity and initial summaries before mutable inputs change', async () => {
    const actor = { ...principal };
    const details = { before: { physicalPointCount: 2, logicalChannelCount: 3 } };
    const lifecycle = audit.begin(actor, 12, 'profile_change', details);
    actor.userId = 99;
    details.before.logicalChannelCount = 100;
    await lifecycle.finish('succeeded');
    expect(record.mock.calls[1][0].principal.userId).toBe(7);
    expect(record.mock.calls[1][0].details['before.logicalChannelCount']).toBe(3);
  });

  it.each(['dispatched', 'acknowledged', 'rejected', 'timeout', 'transport_failure'] as const)(
    'preserves the bounded manual command result %s', async (result) => {
      const lifecycle = audit.begin(principal, 12, 'manual_command', {
        channelId: 'output-a', commandId: '9c53280c-01cd-4f67-8a40-23d9f1ffecfe', operation: 'set',
      });
      await lifecycle.finish(['dispatched', 'acknowledged'].includes(result) ? 'succeeded' : 'failed', { result });
      expect(record.mock.calls[1][0].details.result).toBe(result);
    },
  );

  it('returns unavailable when the host has no foundation without failing the domain operation', async () => {
    const unavailable = new WagoAudit({ logger: { log: jest.fn(), error: jest.fn(), warn } });
    await expect(unavailable.begin(principal, 12, 'claim').finish('succeeded')).resolves.toEqual({ status: 'unavailable' });
    await expect(unavailable.run(principal, 12, 'claim', {}, async () => 'claimed')).resolves.toBe('claimed');
    expect(warn).toHaveBeenCalledWith('WAGO audit storage unavailable');
  });

  it('does not turn audit storage exceptions into mutation failures or leak them', async () => {
    record.mockRejectedValueOnce(new Error('SECRET'));
    await expect(audit.run(principal, 12, 'claim', {}, async () => 'claimed')).resolves.toBe('claimed');
    expect(warn.mock.calls).toEqual([['WAGO audit storage unavailable']]);
  });
});

describe('WAGO audit projection', () => {
  it('excludes unexpected fields at every level and allows only enum values and bounded identifiers', () => {
    const untrusted = {
      revision: 2, sourceRevision: 1, profileId: 3, profileVersion: 4,
      presetId: 'generic-digital-output' as const, channelId: 'output-a',
      operation: 'set' as const, result: 'dispatched' as const,
      before: { physicalPointCount: 1, logicalChannelCount: 2, password: 'SECRET' },
      after: { physicalPointCount: 1, logicalChannelCount: 3, payload: 'SECRET' },
      password: 'SECRET', claimSecret: 'SECRET', telemetry: 'SECRET', errors: ['SECRET'],
    };
    expect(wagoAuditDetails(untrusted)).toEqual({
      revision: 2, sourceRevision: 1, profileId: 3, profileVersion: 4,
      presetId: 'generic-digital-output', channelId: 'output-a', operation: 'set', result: 'dispatched',
      'before.physicalPointCount': 1, 'before.logicalChannelCount': 2,
      'after.physicalPointCount': 1, 'after.logicalChannelCount': 3,
    });
    expect(wagoAuditDetails(JSON.parse(JSON.stringify({
      revision: -1, profileId: 'SECRET', presetId: 'SECRET', operation: 'SECRET', result: 'SECRET',
      channelId: 'mqtt://SECRET', commandId: 'SECRET', before: { physicalPointCount: -2 },
    })))).toEqual({});
  });

  it('summarizes configuration shape without serializing points, channel values or telemetry', () => {
    expect(wagoAuditSummary({ physicalPoints: [{ password: 'SECRET' }], logicalChannels: [{ payload: 'SECRET' }] }))
      .toEqual({ physicalPointCount: 1, logicalChannelCount: 1 });
  });

  it('selects the authenticated principal without request-body overrides or token values', () => {
    const request = {
      user: { id: 7, authenticationMethod: 'api-token', apiTokenId: 9, jwtTokenId: 'SECRET' },
      body: { userId: 99, principal: { userId: 99 }, password: 'SECRET' },
    } as unknown as AuthenticatedRequest;
    expect(wagoAuditPrincipal(request)).toEqual(principal);
    expect(() => wagoAuditPrincipal({ body: request.body } as AuthenticatedRequest)).toThrow();
    expect(() => wagoAuditPrincipal({ user: { id: 1, authenticationMethod: 'api-token' } } as AuthenticatedRequest)).toThrow();
  });
});
