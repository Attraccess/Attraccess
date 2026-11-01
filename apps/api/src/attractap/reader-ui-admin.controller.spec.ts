/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException } from '@nestjs/common';
import { ReaderUiAdminController } from './reader-ui-admin.controller';

function setup() {
  const settings = {
    getResource: jest.fn().mockResolvedValue({ noScreenPolicy: null, plugins: [] }),
    setResource: jest.fn().mockResolvedValue(undefined),
    getReader: jest.fn().mockResolvedValue({ widgetsEnabled: false }),
    setReader: jest.fn().mockResolvedValue(undefined),
  };
  const alerts = { listOpen: jest.fn().mockResolvedValue([{ id: 1 }]), clear: jest.fn() };
  const slots = { syncReader: jest.fn(), contributionsOf: jest.fn().mockReturnValue([{ plugin: 'p' }]) };
  const controller = new ReaderUiAdminController(settings as never, alerts as never, slots as never);
  const req = { user: { id: 4 } } as any;
  return { controller, settings, alerts, slots, req };
}

describe('ReaderUiAdminController', () => {
  it('saves resource settings as the acting admin and resyncs every reader', async () => {
    const { controller, settings, slots, req } = setup();
    const dto = { noScreenPolicy: 'block' as const, plugins: [] };
    await controller.updateResourceSettings(3, dto, req);
    expect(settings.setResource).toHaveBeenCalledWith(3, dto, 4);
    expect(slots.syncReader).toHaveBeenCalledWith(undefined);
    expect(await controller.getResourceSettings(3)).toEqual({ noScreenPolicy: null, plugins: [] });
  });

  it('saves the reader toggle and resyncs only that reader', async () => {
    const { controller, settings, slots, req } = setup();
    expect(await controller.updateReaderSettings(8, { widgetsEnabled: false }, req)).toEqual({ widgetsEnabled: false });
    expect(settings.setReader).toHaveBeenCalledWith(8, false, 4);
    expect(slots.syncReader).toHaveBeenCalledWith(8);
  });

  it('lists contributions and open alerts', async () => {
    const { controller } = setup();
    expect(controller.getContributions(8)).toEqual([{ plugin: 'p' }]);
    expect(await controller.getAlerts()).toEqual([{ id: 1 }]);
  });

  it('clears an alert and answers 404 when it is gone', async () => {
    const { controller, alerts, req } = setup();
    alerts.clear.mockResolvedValueOnce({ id: 5 });
    expect(await controller.clearAlert(5, req)).toEqual({ id: 5 });
    expect(alerts.clear).toHaveBeenCalledWith(5, 4);
    alerts.clear.mockResolvedValueOnce(null);
    await expect(controller.clearAlert(6, req)).rejects.toThrow(NotFoundException);
  });
});
