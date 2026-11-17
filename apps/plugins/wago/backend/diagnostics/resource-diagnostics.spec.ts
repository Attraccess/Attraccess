import { flowNode, hostDataWithFlows } from '../persistence.test-utils';
import { controllerRow } from '../rows.test-utils';
import { spyOnWagoStorage } from '../storage-spy.test-utils';
import { createWagoTestStorage } from '../storage/testing';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EffectivePermissionsGuard, type PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoDiagnosticsController } from './service';
import { WagoDiagnosticsService } from './service';
import type { WagoService } from '../controllers/service';

describe('resource diagnostics', () => {
  async function setup(ids: unknown[]) {
    // The host flow lookup: the first call lists this resource's nodes, the second the conflicting ones.
    const findNodes = jest
      .fn()
      .mockResolvedValue(ids.map((controllerId) => flowNode({ id: 'n', data: { controllerId } })));
    const storage = createWagoTestStorage();
    const valid = [
      ...new Set(ids.filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)),
    ];
    await storage.tables.controllers.insertMany(
      valid.map((id) => controllerRow({ id, name: `Controller ${id}`, hardwareId: `hardware-${id}` })),
    );
    const spy = spyOnWagoStorage(storage);
    const service = new WagoDiagnosticsService(
      { ...spy.context, hostData: hostDataWithFlows(findNodes) } as unknown as PluginContext,
      {} as WagoService,
    );
    return { findNodes, controllers: spy.spied.controllers, revisions: spy.spied.configurationRevisions, service };
  }

  it('looks up only the requested resource and batches controller associations', async () => {
    const { findNodes, controllers, revisions, service } = await setup([1, 1, 2]);
    const result = await service.getResource(42);
    expect(findNodes).toHaveBeenCalledWith({
      typePrefix: 'plugin.wago.',
      resourceId: 42,
      orderById: true,
      limit: 1001,
    });
    // One lookup for all controllers and one for their applied revisions, however many nodes reference them.
    expect(controllers.find).toHaveBeenCalledTimes(1);
    expect(controllers.find).toHaveBeenCalledWith({ where: { id: { in: [1, 2] } } });
    expect(revisions.find).toHaveBeenCalledTimes(1);
    expect(revisions.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { controllerId: { in: [1, 2] }, state: 'applied' } }),
    );
    expect(result.controllers.map((controller) => controller.name)).toEqual(['Controller 1', 'Controller 2']);
    expect(result.truncated).toBe(false);
  });
  it('does no controller work for unrelated resources', async () => {
    const { service, controllers } = await setup([]);
    expect((await service.getResource(42)).controllers).toEqual([]);
    expect(controllers.find).not.toHaveBeenCalled();
  });
  it('bounds nodes and controller work and rejects malformed controller IDs', async () => {
    const { service, controllers } = await setup([null, '1', -1, 1.5, ...Array.from({ length: 1000 }, (_, i) => i + 1)]);
    const result = await service.getResource(42);
    expect(result.invalidControllerReferences).toBe(4);
    expect(result.truncated).toBe(true);
    expect(controllers.find).toHaveBeenCalledWith({
      where: { id: { in: Array.from({ length: 20 }, (_, i) => i + 1) } },
    });
  });
  it('lists each own node once while still flagging channels shared with other resources', async () => {
    const { findNodes, service } = await setup([1]);
    const node = (id: string, resourceId: number, resourceName: string | null = null) =>
      flowNode({
        id,
        resourceId,
        resourceName,
        type: 'plugin.wago.command',
        data: { controllerId: 1, channelId: 'do1' },
      });
    const own = [node('relay-on', 42), node('relay-off', 42)];
    findNodes
      .mockResolvedValueOnce(own)
      // The conflict lookup also returns this resource's own nodes and names the other owners.
      .mockResolvedValueOnce([...own, node('other', 7, 'Workbench outlet')]);
    const [controller] = (await service.getResource(42)).controllers;
    expect(controller.references.map((reference) => [reference.nodeId, reference.conflictResources])).toEqual([
      ['relay-on', [{ id: 7, name: 'Workbench outlet' }]],
      ['relay-off', [{ id: 7, name: 'Workbench outlet' }]],
    ]);
  });
  it('flags channels shared with global flows but never lists global nodes as own references', async () => {
    const { findNodes, service } = await setup([1]);
    const own = [
      flowNode({
        id: 'relay-on',
        resourceId: 42,
        type: 'plugin.wago.command',
        data: { controllerId: 1, channelId: 'do1' },
      }),
    ];
    findNodes.mockResolvedValueOnce(own).mockResolvedValueOnce([
      ...own,
      flowNode({
        id: 'global-on',
        flowId: 8,
        flowName: 'Power off all',
        type: 'plugin.wago.command',
        data: { controllerId: 1, channelId: 'do1' },
      }),
      flowNode({
        id: 'unnamed-on',
        flowId: 9,
        type: 'plugin.wago.command',
        data: { controllerId: 1, channelId: 'do1' },
      }),
    ]);
    const [controller] = (await service.getResource(42)).controllers;
    expect(controller.references.map((reference) => reference.nodeId)).toEqual(['relay-on']);
    expect(controller.references[0]).toMatchObject({
      conflict: true,
      conflictResources: [],
      conflictFlows: [
        { id: 8, name: 'Power off all' },
        { id: 9, name: null },
      ],
    });
  });
  it('keeps both endpoints behind resources.update', () => {
    const guard = new EffectivePermissionsGuard(new Reflector());
    for (const method of ['get', 'getResource'] as const) {
      const context = (permissions: string[]) =>
        ({
          getClass: () => WagoDiagnosticsController,
          getHandler: () => WagoDiagnosticsController.prototype[method],
          switchToHttp: () => ({ getRequest: () => ({ user: { id: 1, effectivePermissions: new Set(permissions) } }) }),
        }) as unknown as ExecutionContext;
      expect(() => guard.canActivate(context([]))).toThrow(ForbiddenException);
      expect(guard.canActivate(context(['resources.update']))).toBe(true);
    }
  });
  it('delegates the resource endpoint without consulting the controller list', async () => {
    const { service } = await setup([]);
    const getResource = jest.spyOn(service, 'getResource');
    new WagoDiagnosticsController(service).getResource(42);
    expect(getResource).toHaveBeenCalledWith(42);
  });
});
