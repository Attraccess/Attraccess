/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReaderUiAdminController } from './reader-ui-admin.controller';

function setup() {
  const settings = {
    getResource: jest.fn().mockResolvedValue({ noScreenPolicy: null, plugins: [] }),
    setResource: jest.fn().mockResolvedValue(undefined),
    getReader: jest.fn().mockResolvedValue({ widgetsEnabled: false }),
    setReader: jest.fn().mockResolvedValue(undefined),
  };
  const alerts = { listOpen: jest.fn().mockResolvedValue([{ id: 1 }]), clear: jest.fn(), findOpen: jest.fn() };
  const slots = { syncReader: jest.fn(), contributionsOf: jest.fn().mockReturnValue([{ plugin: 'p' }]) };
  const resources = { getResourceById: jest.fn().mockResolvedValue({ id: 3 }) };
  const readers = { findReaderById: jest.fn().mockResolvedValue({ id: 8 }) };
  const controller = new ReaderUiAdminController(
    settings as never,
    alerts as never,
    slots as never,
    resources as never,
    readers as never,
  );
  const req = {
    user: { id: 4, authenticationMethod: 'session', effectivePermissions: new Set(['resources.update']) },
  } as any;
  return { controller, settings, alerts, slots, resources, readers, req };
}

describe('ReaderUiAdminController', () => {
  it('saves resource settings as the acting admin and resyncs every reader', async () => {
    const { controller, settings, slots, req } = setup();
    const dto = { noScreenPolicy: 'block' as const, plugins: [] };
    await controller.updateResourceSettings(3, dto, req);
    expect(settings.setResource).toHaveBeenCalledWith(3, dto, req.user);
    expect(slots.syncReader).toHaveBeenCalledWith(undefined);
    expect(await controller.getResourceSettings(3)).toEqual({ noScreenPolicy: null, plugins: [] });
  });

  it('saves the reader toggle and resyncs only that reader', async () => {
    const { controller, settings, slots, req } = setup();
    expect(await controller.updateReaderSettings(8, { widgetsEnabled: false }, req)).toEqual({ widgetsEnabled: false });
    expect(settings.setReader).toHaveBeenCalledWith(8, false, req.user);
    expect(slots.syncReader).toHaveBeenCalledWith(8);
  });

  it('answers 404 for settings of a resource or reader that does not exist', async () => {
    const { controller, settings, resources, readers, req } = setup();
    resources.getResourceById.mockRejectedValue(new NotFoundException('Resource 9 not found'));
    readers.findReaderById.mockResolvedValue(undefined);
    await expect(controller.getResourceSettings(9)).rejects.toThrow(NotFoundException);
    await expect(controller.updateResourceSettings(9, { noScreenPolicy: null, plugins: [] }, req)).rejects.toThrow(
      NotFoundException,
    );
    await expect(controller.getReaderSettings(9)).rejects.toThrow(NotFoundException);
    await expect(controller.getContributions(9)).rejects.toThrow(NotFoundException);
    await expect(controller.updateReaderSettings(9, { widgetsEnabled: false }, req)).rejects.toThrow(NotFoundException);
    expect(settings.setResource).not.toHaveBeenCalled();
    expect(settings.setReader).not.toHaveBeenCalled();
  });

  it('lists contributions and open alerts', async () => {
    const { controller } = setup();
    expect(await controller.getContributions(8)).toEqual([{ plugin: 'p' }]);
    expect(await controller.getAlerts()).toEqual([{ id: 1 }]);
  });

  it('clears a reader crash-loop alert with resources.update and answers 404 when it is gone', async () => {
    const { controller, alerts, req } = setup();
    alerts.findOpen.mockResolvedValueOnce({ id: 5, kind: 'crash-loop', readerId: 8 });
    alerts.clear.mockResolvedValueOnce({ id: 5 });
    expect(await controller.clearAlert(5, req)).toEqual({ id: 5 });
    expect(alerts.clear).toHaveBeenCalledWith(5, req.user);
    alerts.findOpen.mockResolvedValueOnce(null);
    await expect(controller.clearAlert(6, req)).rejects.toThrow(NotFoundException);
  });

  it.each(['breaker-open', 'load-failure'])(
    'needs system.plugins.manage to clear a plugin-scoped %s alert (it resets the plugin globally)',
    async (kind) => {
      const { controller, alerts, req } = setup();
      alerts.findOpen.mockResolvedValue({ id: 7, kind, plugin: 'p' });
      await expect(controller.clearAlert(7, req)).rejects.toThrow(ForbiddenException);
      expect(alerts.clear).not.toHaveBeenCalled();
      const admin = { user: { ...req.user, effectivePermissions: new Set(['system.plugins.manage']) } } as any;
      alerts.clear.mockResolvedValueOnce({ id: 7 });
      await expect(controller.clearAlert(7, admin)).resolves.toEqual({ id: 7 });
    },
  );

  it('does not let plugin managers clear reader crash-loop alerts', async () => {
    const { controller, alerts, req } = setup();
    alerts.findOpen.mockResolvedValue({ id: 5, kind: 'crash-loop', readerId: 8 });
    const pluginAdmin = { user: { ...req.user, effectivePermissions: new Set(['system.plugins.manage']) } } as any;
    await expect(controller.clearAlert(5, pluginAdmin)).rejects.toThrow(ForbiddenException);
  });
});
