import type { AuthenticatedRequest, PluginAuditReceipt, PluginContext } from '@attraccess/plugins-backend-sdk';
import { BadRequestException } from '@nestjs/common';
import { WagoControllerApi } from './wago.controller';
import type { WagoService } from './wago.service';
import type { WagoCommissioningService } from './wago-commissioning.service';

describe('WAGO HTTP administration audit hooks', () => {
  const record = jest.fn<Promise<PluginAuditReceipt>, []>();
  const warn = jest.fn();
  const service = {
    claim: jest.fn(),
    remove: jest.fn(),
    publishDraft: jest.fn(),
    rollback: jest.fn(),
    acknowledgeRejection: jest.fn(),
  };
  const assertOwned = jest.fn<Promise<void>, []>();
  const commissioning = { removeControllerSafely: jest.fn(), removeByHardwareId: jest.fn() };
  const request = { user: { id: 7, authenticationMethod: 'session' }, body: { userId: 999 } } as AuthenticatedRequest;
  const controller = new WagoControllerApi(
    service as unknown as WagoService,
    commissioning as unknown as WagoCommissioningService,
    { audit: { record }, logger: { warn } } as unknown as PluginContext,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    record.mockResolvedValue({ status: 'recorded' });
    assertOwned.mockResolvedValue(undefined);
    commissioning.removeControllerSafely.mockImplementation(async (_id, remove) => {
      const hardwareId = await remove(assertOwned);
      await commissioning.removeByHardwareId(hardwareId);
    });
  });

  const routes = [
    {
      action: 'claim',
      call: () => controller.claim(12, { name: 'SECRET', verifier: 'SECRET' }, request),
      service: service.claim,
      value: { id: 12, password: 'SECRET' },
      details: {},
    },
    {
      action: 'unclaim',
      call: () => controller.removeController(12, request),
      service: service.remove,
      value: 'SECRET-hardware-id',
      details: {},
    },
  ];

  it.each(routes)('audits successful $action after the service resolves', async (route) => {
    route.service.mockImplementation(async () => {
      expect(record).toHaveBeenCalledTimes(1);
      return route.value;
    });
    await route.call();
    expect(record).toHaveBeenCalledTimes(2);
    if (route.action === 'unclaim') expect(service.remove).toHaveBeenCalledWith(12, assertOwned);
    expect(record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: `wago.${route.action}`,
        outcome: 'succeeded',
        details: route.details,
        principal: { userId: 7, authenticationMethod: 'session' },
        subject: { type: 'wago.controller', id: 12 },
      }),
    );
    expect(JSON.stringify(record.mock.calls)).not.toContain('SECRET');
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(routes)('does not claim completion when $action fails', async (route) => {
    const error = new Error('SECRET');
    route.service.mockRejectedValue(error);
    await expect(route.call()).rejects.toBe(error);
    expect(record).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: `wago.${route.action}`, outcome: 'failed' }),
    );
    expect(JSON.stringify(record.mock.calls)).not.toContain('SECRET');
  });

  it('records completed unclaim even if later commissioning history cleanup fails', async () => {
    service.remove.mockResolvedValue('hardware-id');
    commissioning.removeByHardwareId.mockRejectedValue(new Error('cleanup failed'));
    await expect(controller.removeController(12, request)).rejects.toThrow('cleanup failed');
    expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'wago.unclaim', outcome: 'succeeded' }));
  });

  it('rejects missing authenticated identity before mutation', () => {
    expect(() => controller.claim(12, {}, { body: { userId: 1 } } as AuthenticatedRequest)).toThrow();
    expect(service.claim).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it.each([0, -1])('rejects invalid controller ID %s as a client error', async (id) => {
    await expect(controller.claim(id, {}, request)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.claim).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('reports unavailable storage separately without changing the domain result', async () => {
    record.mockResolvedValue({ status: 'unavailable' });
    service.claim.mockResolvedValue({ id: 12 });
    await expect(controller.claim(12, {}, request)).resolves.toEqual({ id: 12 });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('WAGO audit storage unavailable');
  });
  it('passes every publication and rollback identity plus the authenticated principal to locked service auditing', async () => {
    const result = { revision: 8 };
    service.publishDraft.mockResolvedValue(result);
    service.rollback.mockResolvedValue(result);
    await expect(controller.publishDraft(12, request, { force: true, reviewedHash: 'review' })).resolves.toBe(result);
    expect(service.publishDraft).toHaveBeenCalledWith(12, true, 'review', {
      userId: 7,
      authenticationMethod: 'session',
    });
    await expect(
      controller.rollback(12, 3, request, {
        force: true,
        sourceHash: 'source',
        currentHash: 'current',
        draftHash: 'preview',
      }),
    ).resolves.toBe(result);
    expect(service.rollback).toHaveBeenCalledWith(12, 3, true, 'source', 'current', 'preview', {
      userId: 7,
      authenticationMethod: 'session',
    });
    expect(record).not.toHaveBeenCalled();
  });
  it('passes reviewed rejection identity and authenticated actor to the persistence boundary', async () => {
    const expected = { contentHash: 'reviewed', reportedAt: '2026-09-06' };
    service.acknowledgeRejection.mockResolvedValue({ revision: 3 });
    await expect(controller.acknowledgeRejection(12, 3, request, expected)).resolves.toEqual({ revision: 3 });
    expect(service.acknowledgeRejection).toHaveBeenCalledWith(12, 3, expected, {
      userId: 7,
      authenticationMethod: 'session',
    });
    expect(record).not.toHaveBeenCalled();
  });
});
