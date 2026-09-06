import { BadRequestException } from '@nestjs/common';
import { WagoControllerApi } from './wago.controller';
import type { WagoCommissioningService } from './wago-commissioning.service';
import type { WagoService } from './wago.service';
import type { AuthenticatedRequest, PluginContext } from '@attraccess/plugins-backend-sdk';

describe('WagoControllerApi', () => {
  const service = { previewPreset: jest.fn(), applyPreset: jest.fn() } as unknown as WagoService;
  const commissioning = {
    list: jest.fn(),
    create: jest.fn(),
    deliver: jest.fn(),
    recover: jest.fn(),
  } as unknown as WagoCommissioningService;
  const controller = new WagoControllerApi(service, commissioning, {} as PluginContext);
  const request = { user: { id: 42, authenticationMethod: 'session' } } as AuthenticatedRequest;

  beforeEach(() => jest.clearAllMocks());

  describe.each(['deliverCommissioningSession', 'recoverCommissioningSession'] as const)('%s', (method) => {
    it.each([
      {},
      { confirmInstall: false, temporarySsh: { username: 'operator', password: 'secret' } },
      { confirmInstall: true },
      { confirmInstall: true, temporarySsh: { username: ' ', password: 'secret' } },
      { confirmInstall: true, temporarySsh: { username: 'operator', password: '' } },
    ])('rejects missing consent or credentials: %j', (body) => {
      expect(() => controller[method](7, body, request)).toThrow(BadRequestException);
      expect(commissioning.deliver).not.toHaveBeenCalled();
      expect(commissioning.recover).not.toHaveBeenCalled();
    });
  });

  it('returns the recovery session response and forwards only validated attempt fields', async () => {
    const response = { id: 7, state: 'delivery_failed' };
    jest
      .mocked(commissioning.recover)
      .mockResolvedValue(response as Awaited<ReturnType<WagoCommissioningService['recover']>>);
    const input = { confirmInstall: true, temporarySsh: { username: 'operator', password: 'test-only-secret' } };
    await expect(controller.recoverCommissioningSession(7, input, request)).resolves.toEqual(response);
    expect(commissioning.recover).toHaveBeenCalledWith(7, input, { userId: 42, authenticationMethod: 'session' });
    expect(commissioning.deliver).not.toHaveBeenCalled();
  });

  it('propagates safe recovery errors', async () => {
    jest.mocked(commissioning.recover).mockRejectedValue(new BadRequestException('Runtime snapshot unavailable'));
    await expect(
      controller.recoverCommissioningSession(
        7,
        { confirmInstall: true, temporarySsh: { username: 'operator', password: 'test-only-secret' } },
        request,
      ),
    ).rejects.toThrow('Runtime snapshot unavailable');
  });

  it.each([
    ['previewPreset', () => controller.previewPreset(1, {})],
    ['applyPreset', () => controller.applyPreset(1, {}, {} as AuthenticatedRequest)],
  ])('rejects a preset %s request without an application', (_operation, request) => {
    expect(request).toThrow(new BadRequestException('application is required'));
  });

  it('passes bounded-session pagination parameters to commissioning', () => {
    controller.commissioningSessions('20', '40');

    expect(commissioning.list).toHaveBeenCalledWith(20, 40);
  });

  it('requires automatic-claim details when creating a commissioning session', () => {
    expect(() =>
      controller.createCommissioningSession({ mqttServerId: 1, targetHost: '192.168.1.10' }, request),
    ).toThrow(new BadRequestException('controller name is required'));
  });
});
