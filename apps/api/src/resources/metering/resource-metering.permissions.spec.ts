import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthenticatedRequest, DualAuthGuard } from '@attraccess/plugins-backend-sdk';
import type { PluginUserModel } from '@attraccess/application-models';
import request from 'supertest';
import { ResourceMeteringController } from './resource-metering.controller';
import { ResourceMeteringService } from './resource-metering.service';
import { MeterRemoval } from './meter-removal';
import { ResourceActivityVisibilityService } from '../usage/authorization/resource-activity-visibility.service';
import { ResourceListVisibilityService } from '../visibility/resource-list-visibility.service';

/** Archiving, restoring and deleting a meter need `resources.update`, like creating and renaming one. */
describe('Meter removal authorization', () => {
  let app: INestApplication;
  const removal = {
    archive: jest.fn().mockResolvedValue({ id: 1 }),
    restore: jest.fn().mockResolvedValue({ id: 1 }),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ResourceMeteringController],
      providers: [
        { provide: ResourceMeteringService, useValue: {} },
        { provide: ResourceActivityVisibilityService, useValue: {} },
        { provide: ResourceListVisibilityService, useValue: { canSee: async () => true } },
        { provide: MeterRemoval, useValue: removal },
      ],
    })
      .overrideGuard(DualAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
          req.user = Object.assign({} as PluginUserModel, {
            id: 1,
            authenticationMethod: 'api-token',
            apiTokenId: 9,
            effectivePermissions: new Set(String(req.headers['permissions'] ?? '').split(',')),
          });
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app.close());

  const calls = [
    ['archive', 'post', '/resources/1/metering/meters/1/archive', 200],
    ['restore', 'post', '/resources/1/metering/meters/1/restore', 200],
    ['delete', 'delete', '/resources/1/metering/meters/1', 204],
  ] as const;

  it.each(calls)('refuses to %s a meter for billing managers and readers', async (action, method, path) => {
    for (const permissions of ['billing.manage', 'resources.read', ''])
      await request(app.getHttpServer())[method](path).set('permissions', permissions).expect(403);
    expect(removal[action]).not.toHaveBeenCalled();
  });

  it.each(calls)('lets people who may edit the resource %s a meter', async (action, method, path, status) => {
    await request(app.getHttpServer())[method](path).set('permissions', 'resources.update').expect(status);
    expect(removal[action]).toHaveBeenCalledWith(1, 1, { id: 1, authenticationMethod: 'api-token', apiTokenId: 9 });
  });
});
