import { CanActivate, ExecutionContext, Global, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  DualAuthGuard,
  PLUGIN_RESOURCE_VISIBILITY_HOST,
  type PluginContext,
  type PluginResourceAccessContext,
} from '@attraccess/plugins-backend-sdk';
import {
  createResourceAccessContext,
  type ResourceAccessDeps,
} from '../../../api/src/plugin-system/runtime/resource-access';
import { ResourceListVisibilityService } from '../../../api/src/resources/visibility/resource-list-visibility.service';
import plugin from '../backend/plugin';
import { Harness, createHarness } from '../backend/testing/harness.test-utils';

const VISIBLE = 1;
const HIDDEN = 2;
const MISSING = 999;
const MEMBER = 10;
const PERMISSIONS = new Set(['resources.read']);

class MemberAuth implements CanActivate {
  canActivate(context: ExecutionContext) {
    context.switchToHttp().getRequest().user = {
      id: MEMBER,
      authenticationMethod: 'session',
      effectivePermissions: new Set(PERMISSIONS),
    };
    return true;
  }
}

/**
 * The real reservation routes with the host's real `resourceAccess`, `@ResourceVisible()` interceptor and core
 * machine list rule, in "permitted-only" mode with a member who is permitted on one of two machines. Only the host's
 * database lookups are stubbed.
 */
describe('reservation routes and machine list visibility over HTTP (ATT-1407)', () => {
  let h: Harness;
  let app: INestApplication;
  let listMode: 'permitted-only' | 'authenticated';

  beforeEach(async () => {
    listMode = 'permitted-only';
    h = await createHarness();
    for (const id of [VISIBLE, HIDDEN]) await h.enable(id, { whoCanBook: 'any-user' });

    const listVisibility = new ResourceListVisibilityService(
      { getResourceListVisibility: async () => listMode } as never,
      {
        permittedIds: async (_userId: number, ids: number[]) => ids.filter((id) => id === VISIBLE),
      } as never,
    );
    const hostAccess = createResourceAccessContext(
      () =>
        ({
          findUser: async (id: number) => ({ id }),
          rbac: { getEffectivePermissions: async () => PERMISSIONS },
          listVisibility,
          // No hidden resource groups here: every existing machine passes that rule.
          filterOutHiddenGroupResources: async (_userId: number, ids: number[]) =>
            ids.filter((id) => id === VISIBLE || id === HIDDEN),
          listResourceIds: async () => [VISIBLE, HIDDEN],
        }) as unknown as ResourceAccessDeps,
    );
    const resourceAccess: PluginResourceAccessContext = {
      ...h.context.resourceAccess,
      filterVisible: hostAccess.filterVisible,
      canSee: hostAccess.canSee,
      listVisibleResourceIds: hostAccess.listVisibleResourceIds,
    };
    const machine = (id: number) => ({ id, name: `Resource ${id}`, type: 'machine', maxParallelSessions: 1 });
    const context = Object.assign(Object.create(h.context) as PluginContext, {
      resourceAccess,
      hostData: {
        resources: {
          get: async (id: number) => (id === VISIBLE || id === HIDDEN ? machine(id) : null),
          getNames: async (ids: number[]) => new Map(ids.map((id) => [id, `Resource ${id}`])),
        },
        users: {
          getDisplayNames: async (ids: number[]) => new Map(ids.map((id) => [id, `user${id}`])),
          getLocales: async () => new Map<number, string | null>(),
        },
        settings: { getApp: async () => null },
      },
    });

    @Global()
    @Module({
      providers: [{ provide: PLUGIN_RESOURCE_VISIBILITY_HOST, useValue: hostAccess }],
      exports: [PLUGIN_RESOURCE_VISIBILITY_HOST],
    })
    class HostModule {}

    const moduleRef = await Test.createTestingModule({ imports: [HostModule, plugin.register(context)] })
      .overrideGuard(DualAuthGuard)
      .useClass(MemberAuth)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    await h.close();
  });

  const range = 'from=2026-06-01T00:00:00Z&to=2026-06-08T00:00:00Z';
  const get = (path: string) => request(app.getHttpServer()).get(path);
  const ROUTES = [
    (id: number) => `/reservations/resources/${id}/availability?${range}`,
    (id: number) => `/reservations/resources/${id}/manager-access`,
    (id: number) => `/reservations/resources/${id}/pending-decision`,
  ];
  const coreNotFound = (id: number) => ({
    statusCode: 404,
    message: 'ResourceNotFoundException',
    error: `Resource with ID ${id} not found`,
  });

  it.each(ROUTES)('answers 200 on the visible machine and core’s 404 on the hidden one (%#)', async (route) => {
    expect((await get(route(VISIBLE))).status).toBe(200);
    const hidden = await get(route(HIDDEN));
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual(coreNotFound(HIDDEN));
    const missing = await get(route(MISSING));
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(coreNotFound(MISSING));
  });

  it('answers the settings routes of a hidden machine 404 before the manager check', async () => {
    for (const path of [`settings`, `settings/future-bookings-count`]) {
      expect((await get(`/reservations/resources/${VISIBLE}/${path}`)).status).toBe(403);
      expect((await get(`/reservations/resources/${HIDDEN}/${path}`)).body).toEqual(coreNotFound(HIDDEN));
    }
    const update = await request(app.getHttpServer())
      .put(`/reservations/resources/${HIDDEN}/settings`)
      .send({ enabled: false });
    expect(update.body).toEqual(coreNotFound(HIDDEN));
  });

  it('refuses to book the hidden machine and books the visible one', async () => {
    // The module runs on the real clock: tomorrow noon UTC.
    const startTime = new Date(Date.now() + 86_400_000);
    startTime.setUTCHours(12, 0, 0, 0);
    const book = (resourceId: number) =>
      request(app.getHttpServer())
        .post('/reservations')
        .send({ resourceId, startTime: startTime.toISOString(), durationMinutes: 60 });
    const refused = await book(HIDDEN);
    expect(refused.status).toBe(404);
    expect(refused.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    expect((await book(VISIBLE)).status).toBe(201);
  });

  it('leaves a malformed id to the route’s own validation', async () => {
    expect((await get(`/reservations/resources/abc/availability?${range}`)).status).toBe(400);
  });

  it('changes nothing for a resources.read holder in "authenticated" mode', async () => {
    listMode = 'authenticated';
    for (const route of ROUTES) expect((await get(route(HIDDEN))).status).toBe(200);
  });
});
