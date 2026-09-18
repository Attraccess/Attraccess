import type { AuthenticatedRequest, PluginAuditReceipt, PluginContext } from '@attraccess/plugins-backend-sdk';
import { BadRequestException } from '@nestjs/common';
import { WagoControllerApi } from './wago.controller';
import type { WagoService } from './wago.service';
import type { WagoCommissioningService } from './wago-commissioning.service';
import type { WagoCredentialRotationService } from './wago-credential-rotation';

describe('WAGO HTTP administration audit hooks', () => {
  const record = jest.fn<Promise<PluginAuditReceipt>, []>();
  const warn = jest.fn();
  const service = { claim: jest.fn(), remove: jest.fn(), publishDraft: jest.fn(), rollback: jest.fn() };
  const commissioning = {
    removeByHardwareId: jest.fn(),
    removeControllerSafely: jest.fn(async (_id: number, remove: (assertOwned: () => Promise<void>) => Promise<void>) =>
      remove(async () => undefined),
    ),
  };
  const request = { user: { id: 7, authenticationMethod: 'session' }, body: { userId: 999 } } as AuthenticatedRequest;
  const controller = new WagoControllerApi(
    service as unknown as WagoService,
    commissioning as unknown as WagoCommissioningService,
    {} as WagoCredentialRotationService,
    { audit: { record }, logger: { warn } } as unknown as PluginContext,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    record.mockResolvedValue({ status: 'recorded' });
    commissioning.removeControllerSafely.mockImplementation(
      async (_id: number, remove: (assertOwned: () => Promise<void>) => Promise<void>) => remove(async () => undefined),
    );
  });

  const routes = [
    { action: 'claim', call: () => controller.claim(12, { name: 'SECRET', verifier: 'SECRET' }, request), service: service.claim, value: { id: 12, password: 'SECRET' }, details: {} },
    { action: 'unclaim', call: () => controller.removeController(12, request), service: service.remove, value: 'SECRET-hardware-id', details: {} },
  ];

  it.each(routes)('audits successful $action after the service resolves', async (route) => {
    route.service.mockImplementation(async () => {
      expect(record).toHaveBeenCalledTimes(1);
      return route.value;
    });
    await route.call();
    expect(record).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenLastCalledWith(expect.objectContaining({
      action: `wago.${route.action}`, outcome: 'succeeded', details: route.details,
      principal: { userId: 7, authenticationMethod: 'session' }, subject: { type: 'wago.controller', id: 12 },
    }));
    expect(JSON.stringify(record.mock.calls)).not.toContain('SECRET');
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(routes)('does not claim completion when $action fails', async (route) => {
    const error = new Error('SECRET');
    route.service.mockRejectedValue(error);
    await expect(route.call()).rejects.toBe(error);
    expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ action: `wago.${route.action}`, outcome: 'failed' }));
    expect(JSON.stringify(record.mock.calls)).not.toContain('SECRET');
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
});
