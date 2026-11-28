import { NetworkRestrictionService } from '../../../network-restriction/network-restriction.service';
import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { ResourceUsageController } from './resource-usage.controller';
import { ResourceUsageService } from './resource-usage.service';
import { ResourceActivityVisibilityService } from '../authorization/resource-activity-visibility.service';
import { SessionEndNotifier } from '../pre-start/session-end-notifier.service';
import { PreStartService } from '../pre-start/pre-start.service';
import { ResourceListVisibilityService } from '../../visibility/resource-list-visibility.service';

class FakeAuth implements CanActivate {
  canActivate(context: ExecutionContext) {
    context.switchToHttp().getRequest().user = {
      id: 7,
      effectivePermissions: new Set(),
      locale: 'en',
      authenticationMethod: 'session',
    };
    return true;
  }
}

/** ATT-1421: the body of a project switch, checked by the same validation the API bootstrap installs. */
describe('POST /resources/:resourceId/usage/sessions/active/project', () => {
  let app: INestApplication;
  const switchSessionProject = jest.fn();

  beforeEach(async () => {
    switchSessionProject.mockReset().mockResolvedValue({ id: 99, userId: 7, projectId: null });
    const moduleRef = await Test.createTestingModule({
      controllers: [ResourceUsageController],
      providers: [
        { provide: ResourceListVisibilityService, useValue: { canSee: jest.fn(async () => true) } },
        { provide: ResourceUsageService, useValue: { switchSessionProject } },
        { provide: ResourceActivityVisibilityService, useValue: {} },
        { provide: PreStartService, useValue: {} },
        { provide: SessionEndNotifier, useValue: {} },
        { provide: NetworkRestrictionService, useValue: { assertAllowed: jest.fn() } },
      ],
    })
      .overrideGuard(DualAuthGuard)
      .useClass(FakeAuth)
      .overrideGuard(EffectivePermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    // As in main.bootstrap.ts.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
    );
    await app.init();
  });

  afterEach(() => app.close());

  const post = (body: object) =>
    request(app.getHttpServer()).post('/resources/5/usage/sessions/active/project').send(body);

  it.each([
    ['no project at all', {}],
    ['project 0', { projectId: 0 }],
    ['a negative project', { projectId: -3 }],
    ['a fractional project', { projectId: 1.5 }],
    ['a project that is not a number', { projectId: 'thesis' }],
    ['a usage id that is not positive', { projectId: 2, usageId: 0 }],
  ])('refuses %s with 400 before anything is switched', async (_name, body) => {
    const response = await post(body);

    expect(response.status).toBe(400);
    expect(switchSessionProject).not.toHaveBeenCalled();
  });

  it('accepts null: the session continues without a project', async () => {
    const response = await post({ projectId: null });

    expect(response.status).toBe(201);
    expect(switchSessionProject).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ id: 7 }),
      expect.objectContaining({ projectId: null }),
      expect.anything(),
    );
  });

  it('accepts a project and a named session', async () => {
    const response = await post({ projectId: 2, usageId: 1204 });

    expect(response.status).toBe(201);
    expect(switchSessionProject.mock.calls[0][2]).toMatchObject({ projectId: 2, usageId: 1204 });
  });

  it('reads a numeric string as that number, like every number in a body of this API', async () => {
    const response = await post({ projectId: '7' });

    expect(response.status).toBe(201);
    expect(switchSessionProject.mock.calls[0][2]).toMatchObject({ projectId: 7 });
  });
});
