import { BadRequestException } from '@nestjs/common';
import { WagoControllerApi } from './wago.controller';
import type { WagoCommissioningService } from './wago-commissioning.service';
import type { WagoService } from './wago.service';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';

describe('WagoControllerApi', () => {
  const service = { previewPreset: jest.fn(), applyPreset: jest.fn() } as unknown as WagoService;
  const commissioning = { list: jest.fn(), create: jest.fn() } as unknown as WagoCommissioningService;
  const controller = new WagoControllerApi(service, commissioning, {} as PluginContext);

  it.each([
    ['previewPreset', () => controller.previewPreset(1, {})],
    ['applyPreset', () => controller.applyPreset(1, {})],
  ])('rejects a preset %s request without an application', (_operation, request) => {
    expect(request).toThrow(new BadRequestException('application is required'));
  });

  it('passes bounded-session pagination parameters to commissioning', () => {
    controller.commissioningSessions('20', '40');

    expect(commissioning.list).toHaveBeenCalledWith(20, 40);
  });

  it('requires automatic-claim details when creating a commissioning session', () => {
    expect(() => controller.createCommissioningSession({ mqttServerId: 1, targetHost: '192.168.1.10' })).toThrow(
      new BadRequestException('controller name is required'),
    );
  });
});
