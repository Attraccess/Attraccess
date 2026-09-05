import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EffectivePermissionsGuard, type PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoDiagnosticsController } from './diagnostics.controller';
import { WagoDiagnosticsService } from './diagnostics.service';
import type { WagoService } from './wago.service';
import type { WagoDiagnostics } from '../diagnostics-types';

describe('resource diagnostics', () => {
  function setup(ids: unknown[]) {
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(ids.map((controllerId) => ({ data: { controllerId } }))),
    };
    const service = new WagoDiagnosticsService(
      {
        dataSource: { getRepository: () => ({ createQueryBuilder: () => query }) },
      } as unknown as PluginContext,
      {} as WagoService,
    );
    const get = jest.spyOn(service, 'get').mockImplementation(
      async (controllerId) =>
        ({
          name: `Controller ${controllerId}`,
          referencesTruncated: false,
          references: [
            { resourceId: 42, nodeId: 'local', conflict: true },
            { resourceId: 99, nodeId: 'other' },
          ],
        }) as WagoDiagnostics,
    );
    return { query, service, get };
  }

  it('looks up only the requested resource, deduplicates controllers and projects only local references', async () => {
    const { query, service, get } = setup([1, 1, 2]);
    const result = await service.getResource(42);
    expect(query.where).toHaveBeenCalledWith('node.resourceId = :resourceId', { resourceId: 42 });
    expect(query.andWhere).toHaveBeenCalledWith('node.type LIKE :type', { type: 'plugin.wago.%' });
    expect(query.take).toHaveBeenCalledWith(1001);
    expect(get.mock.calls).toEqual([[1], [2]]);
    expect(result.controllers[0].references).toEqual([{ resourceId: 42, nodeId: 'local', conflict: true }]);
    expect(result.truncated).toBe(false);
  });
  it('does no controller work for unrelated resources', async () => {
    const { service, get } = setup([]);
    expect((await service.getResource(42)).controllers).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });
  it('bounds nodes and controller work and rejects malformed controller IDs', async () => {
    const { service, get } = setup([null, '1', -1, 1.5, ...Array.from({ length: 1000 }, (_, i) => i + 1)]);
    const result = await service.getResource(42);
    expect(result.invalidControllerReferences).toBe(4);
    expect(result.truncated).toBe(true);
    expect(get).toHaveBeenCalledTimes(20);
    expect(get).not.toHaveBeenCalledWith(21);
  });
  it('isolates deleted controllers and internal failures without disclosing error details', async () => {
    const { service, get } = setup([1, 2]);
    get.mockRejectedValueOnce(new Error('SECRET'));
    const result = await service.getResource(42);
    expect(result.controllers.map((controller) => controller.unavailable)).toEqual([true, false]);
    expect(JSON.stringify(result)).not.toContain('SECRET');
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
