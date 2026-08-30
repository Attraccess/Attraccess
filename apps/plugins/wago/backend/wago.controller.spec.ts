import { BadRequestException } from '@nestjs/common';
import { WagoControllerApi } from './wago.controller';
import type { WagoService } from './wago.service';

describe('WagoControllerApi', () => {
  const service = { previewPreset: jest.fn(), applyPreset: jest.fn() } as unknown as WagoService;
  const controller = new WagoControllerApi(service);

  it.each([
    ['previewPreset', () => controller.previewPreset(1, {})],
    ['applyPreset', () => controller.applyPreset(1, {})],
  ])('rejects a preset %s request without an application', (_operation, request) => {
    expect(request).toThrow(new BadRequestException('application is required'));
  });
});
