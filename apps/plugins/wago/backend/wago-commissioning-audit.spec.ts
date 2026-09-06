import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { auditCommissioning, commissioningPrincipal } from './wago-commissioning-audit';
import { WagoCommissioningService } from './wago-commissioning.service';
import type { WagoService } from './wago.service';

describe('commissioning uses the shared ATT-983 audit sink', () => {
  const principal = { userId: 42, authenticationMethod: 'session' as const };
  const record = jest.fn(async (event: { operationId: string; outcome: string }) => {
    void event;
    return { status: 'recorded' };
  });
  const warn = jest.fn();
  const context = { audit: { record }, logger: { warn } } as unknown as PluginContext;
  beforeEach(() => {
    record.mockClear();
    warn.mockClear();
  });

  it('emits exactly one claim lifecycle without credentials or payload projection', async () => {
    const value = { password: 'synthetic-secret', state: 'claimed' };
    expect(await auditCommissioning(context, principal, 9, 'claim', async () => value)).toBe(value);
    expect(record).toHaveBeenCalledTimes(2);
    expect(record.mock.calls[0][0]).toMatchObject({
      action: 'wago.claim',
      subject: { type: 'wago.controller', id: 9 },
      principal,
      outcome: 'attempted',
    });
    expect(record.mock.calls[1][0]).toMatchObject({
      operationId: record.mock.calls[0][0].operationId,
      outcome: 'succeeded',
      details: {},
    });
    expect(JSON.stringify(record.mock.calls)).not.toContain('synthetic-secret');
  });

  it('records returned failed deployment states as failed rather than HTTP success', async () => {
    await auditCommissioning(
      context,
      principal,
      8,
      'install',
      async () => ({ state: 'delivery_failed' }),
      (value) => value.state === 'awaiting_discovery',
    );
    expect(record.mock.calls[1][0].outcome).toBe('failed');
  });

  it('classifies recovery by its outcome rather than its display heading', async () => {
    const service = new WagoCommissioningService(context, {} as WagoService);
    service['recoverWhileAudited'] = jest
      .fn()
      .mockResolvedValue({ state: 'revoked', failureReason: null, progressStep: 'A renamed heading' });
    await service.recover(8, {}, principal);
    expect(record.mock.calls[1][0].outcome).toBe('succeeded');
  });

  it('does not invent principals for legacy jobs and has no fallback audit sink', async () => {
    await auditCommissioning(context, null, 8, 'install', async () => undefined);
    expect(record).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('WAGO audit storage unavailable');
  });

  it('rejects unauthenticated actors and strips body-like extras from authenticated metadata', () => {
    expect(() => commissioningPrincipal({ user: null } as never)).toThrow();
    expect(
      commissioningPrincipal({ user: { id: 42, authenticationMethod: 'session', secret: 'not metadata' } } as never),
    ).toEqual(principal);
  });
});
