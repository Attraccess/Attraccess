import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EffectivePermissionsGuard, type PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoDiagnosticsController } from './diagnostics.controller';
import { WagoDiagnosticsService } from './diagnostics.service';
import { WagoController } from './wago-controller.entity';
import type { WagoService } from './wago.service';

describe('resource diagnostics', () => {
  function setup(ids: unknown[]) {
    const nodesQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(ids.map((controllerId) => ({ data: { controllerId } }))),
    };
    const controllersQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockImplementation(async () =>
          ids
            .filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
            .map((id) => ({ id, name: `Controller ${id}`, hardwareId: `hardware-${id}` })),
        ),
    };
    const revisionsQuery = {
      select: jest.fn().mockReturnThis(),
      distinctOn: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const service = new WagoDiagnosticsService(
      {
        getRepository: (entity: unknown) =>
          entity === WagoController
            ? { createQueryBuilder: () => controllersQuery }
            : { createQueryBuilder: () => revisionsQuery },
        dataSource: { getRepository: () => ({ createQueryBuilder: () => nodesQuery }) },
      } as unknown as PluginContext,
      {} as WagoService,
    );
    return { nodesQuery, controllersQuery, revisionsQuery, service };
  }

  it('looks up only the requested resource and batches controller associations', async () => {
    const { nodesQuery, controllersQuery, revisionsQuery, service } = setup([1, 1, 2]);
    const result = await service.getResource(42);
    expect(nodesQuery.where).toHaveBeenCalledWith('node.resourceId = :resourceId', { resourceId: 42 });
    expect(nodesQuery.andWhere).toHaveBeenCalledWith('node.type LIKE :type', { type: 'plugin.wago.%' });
    expect(nodesQuery.take).toHaveBeenCalledWith(1001);
    expect(controllersQuery.where).toHaveBeenCalledWith('controller.id IN (:...controllerIds)', {
      controllerIds: [1, 2],
    });
    expect(revisionsQuery.andWhere).toHaveBeenCalledWith(expect.stringContaining('SELECT MAX(applied.revision)'));
    expect(result.controllers.map((controller) => controller.name)).toEqual(['Controller 1', 'Controller 2']);
    expect(result.truncated).toBe(false);
  });
  it('does no controller work for unrelated resources', async () => {
    const { service, controllersQuery } = setup([]);
    expect((await service.getResource(42)).controllers).toEqual([]);
    expect(controllersQuery.getMany).not.toHaveBeenCalled();
  });
  it('bounds nodes and controller work and rejects malformed controller IDs', async () => {
    const { service, controllersQuery } = setup([null, '1', -1, 1.5, ...Array.from({ length: 1000 }, (_, i) => i + 1)]);
    const result = await service.getResource(42);
    expect(result.invalidControllerReferences).toBe(4);
    expect(result.truncated).toBe(true);
    expect(controllersQuery.where).toHaveBeenCalledWith('controller.id IN (:...controllerIds)', {
      controllerIds: Array.from({ length: 20 }, (_, i) => i + 1),
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
  it('delegates the resource endpoint without consulting the controller list', () => {
    const { service } = setup([]);
    const getResource = jest.spyOn(service, 'getResource');
    new WagoDiagnosticsController(service).getResource(42);
    expect(getResource).toHaveBeenCalledWith(42);
  });
});
