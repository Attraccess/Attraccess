import { CanActivate, ExecutionContext, INestApplication, Injectable, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';
import supertest from 'supertest';
import {
  SupervisionMode,
  type ResourceRecord as Resource,
  type UsageSession as ResourceUsage,
} from '@attraccess/application-models';
import { DualAuthGuard } from '@attraccess/plugins-backend-sdk';
import type { ResourceListVisibility } from '../../settings/constants';
import { SseInstrumentation } from '../../metrics/instrumentation/sse/sse.helper';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { ResourcesController } from '../resources.controller';
import { ResourcesService } from '../resources.service';
import type { ListResourcesQuery } from '../resource-store.port';
import { RESOURCE_STORE } from '../resource-store.port';
import { ResourceImageService } from '../resourceImage.service';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';
import { SSEController } from '../sse/sse.controller';
import { ResourceEventsService } from '../sse/resource-events.service';
import { NetworkRestrictionService } from '../../network-restriction/network-restriction.service';
import { ResourceUsageController } from '../usage/sessions/resource-usage.controller';
import { ResourceUsageService } from '../usage/sessions/resource-usage.service';
import { USAGE_SESSION_STORE } from '../usage/usage-session-store.port';
import { supervisionModesFrom } from '../usage/authorization/supervision-modes.test-fixture';
import { ResourceActivityVisibilityService } from '../usage/authorization/resource-activity-visibility.service';
import { PreStartService } from '../usage/pre-start/pre-start.service';
import { SessionEndNotifier } from '../usage/pre-start/session-end-notifier.service';
import { SessionEndMaintenanceRequests } from '../usage/sessions/session-end-maintenance-requests';
import { SettingsService } from '../../settings/settings.service';
import { ResourceListVisibilityService } from './resource-list-visibility.service';

const VISIBLE = 1;
const HIDDEN = 2;
const MISSING = 999;
const EXISTING = [VISIBLE, HIDDEN];
const ME = 10;

/** Who is calling, taken from a header. No header: signed out. */
@Injectable()
class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const header = request.headers['x-test-user'];
    if (!header) throw new UnauthorizedException('Authentication required');
    const { id, permissions } = JSON.parse(header as string) as { id: number; permissions: string[] };
    request.user = { id, effectivePermissions: new Set(permissions) };
    return true;
  }
}

const READER = JSON.stringify({ id: ME, permissions: ['resources.read'] });
const MANAGER = JSON.stringify({ id: ME, permissions: ['resources.read', 'resources.update'] });

/** The 404 body with the machine id taken out, so a hidden and a missing machine can be compared. */
const withoutId = (body: unknown, id: number) => JSON.parse(JSON.stringify(body).split(String(id)).join('<id>'));

describe('machine list visibility over HTTP (ATT-843)', () => {
  let app: INestApplication;
  let listMode: ResourceListVisibility;
  let permitted: number[];

  const usage = (resourceId: number) =>
    ({
      id: 5,
      resourceId,
      userId: 77,
      user: { id: 77, username: 'operator' },
      startTime: new Date('2026-10-30T10:00:00Z'),
      endTime: null,
      usageAction: 'usage',
      isFinalized: true,
      lifecyclePending: false,
    }) as unknown as ResourceUsage;

  const machine = (id: number) =>
    ({ id, name: id === HIDDEN ? 'Secret lathe' : 'Mill', usages: [], introductions: [] }) as unknown as Resource;

  /** Mirrors the store: the narrowed page and its total only hold the machines the viewer may see. */
  const resourcesService = {
    listResources: jest.fn(async (query: ListResourcesQuery) => {
      const ids = EXISTING.filter((id) => query.permittedForUserId === undefined || permitted.includes(id));
      return { data: ids.map(machine), total: ids.length, page: 1, limit: 10 };
    }),
    getResourceById: jest.fn(async (id: number) => {
      if (!EXISTING.includes(id)) throw new ResourceNotFoundException(id);
      return machine(id);
    }),
  };
  const usageService = {
    canControllResource: jest.fn(async () => false),
    getResourceUsageHistory: jest.fn(async (resourceId: number) => ({ data: [usage(resourceId)], total: 1 })),
  };
  const eventsService = {
    subscribeResource: jest.fn(async (resourceId: number) =>
      of({ data: { eventType: 'started', inUse: true, usage: usage(resourceId) } }),
    ),
  };
  const store = {
    existingIds: jest.fn(async (ids: number[]) => ids.filter((id) => EXISTING.includes(id))),
    permittedIds: jest.fn(async (_user: number, ids: number[]) =>
      ids.filter((id) => EXISTING.includes(id) && permitted.includes(id)),
    ),
  };

  beforeEach(async () => {
    listMode = 'permitted-only';
    permitted = [VISIBLE];
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [ResourcesController, SSEController, ResourceUsageController],
      providers: [
        ResourceActivityVisibilityService,
        ResourceListVisibilityService,
        { provide: ResourcesService, useValue: resourcesService },
        { provide: ResourceImageService, useValue: { getPublicPath: jest.fn() } },
        { provide: ResourceUsageService, useValue: usageService },
        { provide: ResourceIntroducersService, useValue: { canViewAccessLists: jest.fn(async () => false) } },
        { provide: ResourceEventsService, useValue: eventsService },
        { provide: SseInstrumentation, useValue: { wrap: (_name: string, source: unknown) => source } },
        {
          provide: SettingsService,
          useValue: {
            getResourceActivityVisibility: jest.fn(async () => 'all'),
            getResourceListVisibility: jest.fn(async () => listMode),
          },
        },
        {
          provide: USAGE_SESSION_STORE,
          useValue: supervisionModesFrom(async () =>
            EXISTING.map((id) => ({ id, supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED })),
          ),
        },
        { provide: RESOURCE_STORE, useValue: store },
        { provide: PreStartService, useValue: { gateHttp: jest.fn() } },
        // Network restriction is not what this spec tests: every action is allowed.
        { provide: NetworkRestrictionService, useValue: { assertAllowed: jest.fn() } },
        { provide: SessionEndNotifier, useValue: { applyDefault: jest.fn() } },
        { provide: SessionEndMaintenanceRequests, useValue: { fileAfterEnd: jest.fn() } },
      ],
    })
      .overrideGuard(DualAuthGuard)
      .useClass(HeaderAuthGuard)
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (path: string, user?: string) => {
    const call = supertest(app.getHttpServer()).get(path);
    return user ? call.set('x-test-user', user) : call;
  };

  const PER_MACHINE = ['/resources/:id', '/resources/:id/usage/history', '/resources/:id/events'];
  const at = (route: string, id: number) => route.replace(':id', String(id));

  describe('"permitted-only", caller with only resources.read', () => {
    it.each(PER_MACHINE)('GET %s answers a hidden machine like one that does not exist', async (route) => {
      const hidden = await get(at(route, HIDDEN), READER);
      const missing = await get(at(route, MISSING), READER);
      expect(hidden.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(withoutId(hidden.body, HIDDEN)).toEqual(withoutId(missing.body, MISSING));
      expect(hidden.body).toEqual({
        statusCode: 404,
        message: 'ResourceNotFoundException',
        error: `Resource with ID ${HIDDEN} not found`,
      });
      expect(JSON.stringify(hidden.body)).not.toContain('Secret lathe');
    });

    it('never reaches the route handler for a hidden machine', async () => {
      await get(at('/resources/:id', HIDDEN), READER);
      await get(at('/resources/:id/usage/history', HIDDEN), READER);
      await get(at('/resources/:id/events', HIDDEN), READER);
      expect(resourcesService.getResourceById).not.toHaveBeenCalled();
      expect(usageService.getResourceUsageHistory).not.toHaveBeenCalled();
      expect(eventsService.subscribeResource).not.toHaveBeenCalled();
    });

    it.each(PER_MACHINE)('GET %s still answers a visible machine', async (route) => {
      expect((await get(at(route, VISIBLE), READER)).status).toBe(200);
    });

    it.each(PER_MACHINE)('GET %s answers 401, not 404, without a signed-in user', async (route) => {
      const response = await get(at(route, HIDDEN));
      expect(response.status).toBe(401);
      expect(store.permittedIds).not.toHaveBeenCalled();
    });

    it('lists only the visible machine, counts only it and says the list is narrowed', async () => {
      const response = await get('/resources', READER);
      expect(response.status).toBe(200);
      expect(resourcesService.listResources).toHaveBeenCalledWith(expect.objectContaining({ permittedForUserId: ME }));
      expect(response.body.data.map((resource: Resource) => resource.id)).toEqual([VISIBLE]);
      expect(response.body.total).toBe(1);
      expect(response.body.visibilityScope).toBe('permitted');
    });

    it('shows a machine once the caller is permitted, on the next request', async () => {
      expect((await get(at('/resources/:id', HIDDEN), READER)).status).toBe(404);
      permitted = [VISIBLE, HIDDEN];
      expect((await get(at('/resources/:id', HIDDEN), READER)).status).toBe(200);
    });
  });

  it('lets a resource manager see the hidden machine and the whole list in "permitted-only"', async () => {
    expect((await get(at('/resources/:id', HIDDEN), MANAGER)).status).toBe(200);
    const list = await get('/resources', MANAGER);
    expect(list.body).toMatchObject({ total: 2, visibilityScope: 'all' });
    expect(store.permittedIds).not.toHaveBeenCalled();
  });

  it('shows every machine to a resources.read holder in "authenticated" mode', async () => {
    listMode = 'authenticated';
    for (const route of PER_MACHINE) {
      expect((await get(at(route, HIDDEN), READER)).status).toBe(200);
    }
    const list = await get('/resources', READER);
    expect(list.body).toMatchObject({ total: 2, visibilityScope: 'all' });
    expect(resourcesService.listResources).toHaveBeenCalledWith(
      expect.objectContaining({ permittedForUserId: undefined }),
    );
  });

  it('narrows a caller without resources.read even in "authenticated" mode', async () => {
    listMode = 'authenticated';
    const noRead = JSON.stringify({ id: ME, permissions: [] });
    expect((await get(at('/resources/:id', HIDDEN), noRead)).status).toBe(404);
    const list = await get('/resources', noRead);
    expect(list.body).toMatchObject({ total: 1, visibilityScope: 'permitted' });
  });

  it('answers a malformed id with 400, not 404', async () => {
    expect((await get('/resources/abc', READER)).status).toBe(400);
    expect(store.permittedIds).not.toHaveBeenCalled();
  });
});
