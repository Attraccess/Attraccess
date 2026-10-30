import { CanActivate, ExecutionContext, INestApplication, Injectable, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { firstValueFrom, of, Subject } from 'rxjs';
import supertest from 'supertest';
import { Resource, ResourceIntroducerType, ResourceUsage, SupervisionMode } from '@attraccess/database-entities';
import { AuthenticatedUser, DualAuthGuard } from '@attraccess/plugins-backend-sdk';
import { ResourceActivityVisibility } from '../settings/constants';
import { SseInstrumentation } from '../metrics/instrumentation/sse/sse.helper';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';
import { ResourceImageService } from './resourceImage.service';
import { ResourceIntroducersController } from './introducers/resourceIntroducers.controller';
import { ResourceIntroducersService } from './introducers/resourceIntroducers.service';
import { ResourceIntroductionsController } from './introductions/resourceIntroductions.controller';
import { ResourceIntroductionsService } from './introductions/resouceIntroductions.service';
import { ResourceGroupsIntroducersController } from './groups/introducers/resourceGroups.introducers.controller';
import { ResourceGroupsIntroducersService } from './groups/introducers/resourceGroups.introducers.service';
import { SSEController } from './sse/sse.controller';
import { ResourceEventsService } from './sse/resource-events.service';
import { ResourceUsageController } from './usage/sessions/resource-usage.controller';
import { ResourceUsageService } from './usage/sessions/resource-usage.service';
import { ResourceActivityVisibilityService } from './usage/authorization/resource-activity-visibility.service';
import { ResourceLiveTopicsProvider } from './resource-live-topics.provider';
import { LiveTopicsService } from '../live-updates/live-topics.service';
import { FlowLogRecorderService } from './flows/logs/flow-log-recorder.service';
import { SettingsService } from '../settings/settings.service';

const MACHINE = 1;
const SUPERVISED_MACHINE = 2;
const ME = 10;
const OTHER = 77;

/** Who is calling, taken from a header so every test can pick a persona. No header: signed out. */
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

type Persona = { permissions: string[]; canControl?: boolean; introducer?: boolean };

const PERSONAS: Record<string, Persona> = {
  'without view resources': { permissions: [] },
  'not introduced': { permissions: ['resources.read'] },
  'introduced directly': { permissions: ['resources.read'], canControl: true },
  'introduced through a group': { permissions: ['resources.read'], canControl: true },
  introducer: { permissions: ['resources.read'], canControl: true, introducer: true },
  maintainer: { permissions: ['resources.read'], canControl: true },
  'manage resources': { permissions: ['resources.read', 'resources.update'] },
  'manage access': { permissions: ['resources.read', 'resources.access.manage'] },
};

describe('reads of equipment activity and access lists (ATT-1149)', () => {
  let app: INestApplication;
  let mode: ResourceActivityVisibility;
  let controllable: boolean;
  let introducer: boolean;
  let activeUsageOwner: number;
  let sseController: SSEController;
  let topics: ResourceLiveTopicsProvider;

  const usage = () =>
    ({
      id: 5,
      resourceId: MACHINE,
      userId: activeUsageOwner,
      user: { id: activeUsageOwner, username: 'operator', email: 'operator@example.test' },
      startTime: new Date('2026-10-30T10:00:00Z'),
      endTime: null,
      usageAction: 'usage',
      isFinalized: true,
      lifecyclePending: false,
    }) as unknown as ResourceUsage;
  /** A finished session; resource reads must never embed these. */
  const pastUsage = () =>
    ({
      ...usage(),
      id: 4,
      userId: OTHER,
      startNotes: 'past session notes',
      endTime: new Date('2026-10-29T12:00:00Z'),
    }) as unknown as ResourceUsage;

  const resourcesService = {
    listResources: jest.fn(async () => ({
      data: [
        { id: MACHINE, name: 'Lathe', usages: [usage()] },
        { id: SUPERVISED_MACHINE, name: 'Mill', usages: [{ ...usage(), id: 6, resourceId: SUPERVISED_MACHINE }] },
      ] as unknown as Resource[],
      total: 2,
      page: 1,
      limit: 10,
    })),
    getResourceById: jest.fn(
      async (id: number) =>
        ({
          id,
          name: 'Lathe',
          usages: [pastUsage(), usage()],
          introductions: [{ id: 1, receiverUserId: OTHER }],
        }) as unknown as Resource,
    ),
  };
  const usageService = {
    canControllResource: jest.fn(async () => controllable),
    getActiveSession: jest.fn(async (resourceId: number) => ({ ...usage(), resourceId })),
    getSessionDetails: jest.fn(async () => usage()),
    getResourceUsageHistory: jest.fn(async () => ({ data: [usage()], total: 1 })),
  };
  const introducersService = {
    isIntroducer: jest.fn(async () => introducer),
    getNames: jest.fn(async () => [{ userId: OTHER, username: 'operator', role: ResourceIntroducerType.INTRODUCER }]),
    getMany: jest.fn(async () => [{ userId: OTHER }]),
    canViewAccessLists: jest.fn(
      async (_id: number, user: AuthenticatedUser) =>
        user.effectivePermissions.has('resources.update') ||
        user.effectivePermissions.has('resources.access.manage') ||
        introducer,
    ),
  };
  const eventsService = {
    subscribeResource: jest.fn(async (resourceId: number) =>
      of({ data: { eventType: 'started', inUse: true, usage: { ...usage(), resourceId } } }),
    ),
  };

  beforeEach(async () => {
    mode = 'introduced';
    controllable = false;
    introducer = false;
    activeUsageOwner = OTHER;
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [
        ResourcesController,
        ResourceIntroducersController,
        ResourceIntroductionsController,
        ResourceGroupsIntroducersController,
        SSEController,
        ResourceUsageController,
      ],
      providers: [
        ResourceActivityVisibilityService,
        ResourceLiveTopicsProvider,
        { provide: ResourcesService, useValue: resourcesService },
        { provide: ResourceImageService, useValue: { getPublicPath: jest.fn() } },
        { provide: ResourceUsageService, useValue: usageService },
        { provide: ResourceIntroducersService, useValue: introducersService },
        {
          provide: ResourceIntroductionsService,
          useValue: {
            getMany: jest.fn(async () => []),
            getHistoryByResourceIdAndUserId: jest.fn(async () => []),
          },
        },
        {
          provide: ResourceGroupsIntroducersService,
          useValue: { getMany: jest.fn(async () => []), isIntroducer: jest.fn(async () => introducer) },
        },
        { provide: ResourceEventsService, useValue: eventsService },
        { provide: SseInstrumentation, useValue: { wrap: (_name: string, source: unknown) => source } },
        { provide: SettingsService, useValue: { getResourceActivityVisibility: jest.fn(async () => mode) } },
        {
          provide: getRepositoryToken(Resource),
          useValue: {
            find: jest.fn(async ({ where }: { where: { id: { _value: number[] } } }) =>
              where.id._value.map((id) => ({
                id,
                supervisionMode:
                  id === SUPERVISED_MACHINE
                    ? SupervisionMode.SUPERVISION_ALLOWED
                    : SupervisionMode.INTRODUCTION_REQUIRED,
              })),
            ),
          },
        },
        { provide: LiveTopicsService, useValue: { register: jest.fn() } },
        { provide: FlowLogRecorderService, useValue: {} },
      ],
    })
      .overrideGuard(DualAuthGuard)
      .useClass(HeaderAuthGuard)
      .compile();
    app = module.createNestApplication();
    await app.init();
    sseController = module.get(SSEController);
    topics = module.get(ResourceLiveTopicsProvider);
  });

  afterEach(async () => {
    await app.close();
  });

  const as = (name: string, id = ME) => {
    const persona = PERSONAS[name];
    controllable = persona.canControl === true;
    introducer = persona.introducer === true;
    return JSON.stringify({ id, permissions: persona.permissions });
  };
  const get = (path: string, user?: string) => {
    const call = supertest(app.getHttpServer()).get(path);
    return user ? call.set('x-test-user', user) : call;
  };

  /** Opens the live feed; the test stream completes after one event, so the response ends on its own. */
  const feed = async (resourceId: number, user: string) => {
    const response = await get(`/resources/${resourceId}/events`, user);
    return { status: response.status, type: String(response.headers['content-type']), text: response.text ?? '' };
  };

  describe('signed out', () => {
    it.each([
      '/resources/in-use',
      `/resources/${MACHINE}`,
      `/resources/${MACHINE}/events`,
      `/resources/${MACHINE}/introductions`,
      `/resources/${MACHINE}/introducers`,
      `/resources/${MACHINE}/introductions/${OTHER}/history`,
      `/resources/${MACHINE}/introducers/names`,
      `/resources/${MACHINE}/introducers/${OTHER}/is-introducer`,
      `/resource-groups/1/introducers`,
      `/resource-groups/1/introducers/${OTHER}/is-introducer`,
      `/resources/${MACHINE}/usage/active`,
      `/resources/${MACHINE}/usage/history`,
      `/resources/${MACHINE}/usage/5`,
    ])('GET %s answers 401 with no data', async (path) => {
      const response = await get(path);
      expect(response.status).toBe(401);
      expect(JSON.stringify(response.body)).not.toContain('operator');
    });
  });

  describe.each(['all', 'introduced'] as const)('in "%s" mode', (visibility) => {
    beforeEach(() => {
      mode = visibility;
    });

    it('lists introducer names, without emails, for everyone with "view resources"', async () => {
      const response = await get(`/resources/${MACHINE}/introducers/names`, as('not introduced'));
      expect(response.status).toBe(200);
      expect(response.body).toEqual([{ userId: OTHER, username: 'operator', role: 'introducer' }]);
      expect(await get(`/resources/${MACHINE}/introducers/names`, as('without view resources'))).toMatchObject({
        status: 403,
      });
    });

    it.each(Object.keys(PERSONAS))('%s: full access lists follow the People-tab rule', async (name) => {
      const allowed = ['introducer', 'manage resources', 'manage access'].includes(name);
      const user = as(name);
      for (const path of [
        `/resources/${MACHINE}/introductions`,
        `/resources/${MACHINE}/introductions/${OTHER}/history`,
        `/resources/${MACHINE}/introducers`,
        `/resource-groups/1/introducers`,
      ]) {
        expect((await get(path, user)).status).toBe(allowed ? 200 : 403);
      }
    });

    it.each(Object.keys(PERSONAS))(
      '%s: introducer checks answer only about the caller unless manager',
      async (name) => {
        const manager = ['manage resources', 'manage access'].includes(name);
        const user = as(name);
        for (const path of [
          `/resources/${MACHINE}/introducers/${OTHER}/is-introducer`,
          `/resource-groups/1/introducers/${OTHER}/is-introducer`,
        ]) {
          expect((await get(path, user)).status).toBe(manager ? 200 : 403);
        }
        for (const path of [
          `/resources/${MACHINE}/introducers/${ME}/is-introducer`,
          `/resource-groups/1/introducers/${ME}/is-introducer`,
        ]) {
          expect((await get(path, user)).status).toBe(200);
        }
      },
    );
  });

  describe('"all equipment" mode', () => {
    it.each(Object.keys(PERSONAS))('%s sees activity exactly when they may view resources', async (name) => {
      mode = 'all';
      const user = as(name);
      const permissions = PERSONAS[name].permissions;
      const sees =
        permissions.includes('resources.read') ||
        permissions.includes('resources.update') ||
        permissions.includes('resources.access.manage');
      const list = await get('/resources/in-use', user);
      expect(list.body.map((resource: Resource) => resource.id)).toEqual(sees ? [MACHINE, SUPERVISED_MACHINE] : []);
      expect((await get(`/resources/${MACHINE}/usage/active`, user)).status).toBe(sees ? 200 : 403);
      expect((await get(`/resources/${MACHINE}/usage/5`, user)).status).toBe(sees ? 200 : 403);
      expect((await get(`/resources/${MACHINE}`, user)).body.usages?.length ?? 0).toBe(sees ? 1 : 0);
      const live = await feed(MACHINE, user);
      expect(live.status).toBe(sees ? 200 : 403);
      if (sees) expect(live.type).toContain('text/event-stream');
      const rejected = await topics.authorize([{ topic: 'resource', resourceId: MACHINE }], {
        id: ME,
        effectivePermissions: new Set(permissions),
      } as unknown as AuthenticatedUser);
      expect(rejected.size).toBe(sees ? 0 : 1);
    });
  });

  describe('"introduced only" mode', () => {
    const SEES_ACTIVITY = [
      'introduced directly',
      'introduced through a group',
      'introducer',
      'maintainer',
      'manage resources',
      'manage access',
    ];

    it.each(Object.keys(PERSONAS))('%s: in-use list, active session, session, feed and topic', async (name) => {
      const sees = SEES_ACTIVITY.includes(name);
      const user = as(name);

      const list = await get('/resources/in-use', user);
      const entries = list.body as Resource[];
      expect(entries.map((resource) => resource.id)).toEqual(
        sees
          ? [MACHINE, SUPERVISED_MACHINE]
          : PERSONAS[name].permissions.includes('resources.read')
            ? [SUPERVISED_MACHINE]
            : [],
      );
      // On the supervised-use machine everyone with "view resources" sees free/in use only, never a name.
      if (!sees) expect(JSON.stringify(entries)).not.toContain('operator');

      const active = await get(`/resources/${MACHINE}/usage/active`, user);
      expect(active.status).toBe(sees ? 200 : 403);
      expect((await get(`/resources/${MACHINE}/usage/5`, user)).status).toBe(sees ? 200 : 403);
      const detail = await get(`/resources/${MACHINE}`, user);
      expect(detail.body.usages?.length ?? 0).toBe(sees ? 1 : 0);
      // Only the running session is embedded, never past ones.
      expect(JSON.stringify(detail.body)).not.toContain('past session notes');
      const live = await feed(MACHINE, user);
      expect(live.status).toBe(sees ? 200 : 403);
      if (sees) {
        expect(live.type).toContain('text/event-stream');
        expect(live.text).toContain('operator');
      }

      const rejected = await topics.authorize([{ topic: 'resource', resourceId: MACHINE }], {
        id: ME,
        effectivePermissions: new Set(PERSONAS[name].permissions),
      } as unknown as AuthenticatedUser);
      expect(rejected.size).toBe(sees ? 0 : 1);
    });

    it('shows someone eligible for a supervised session only free/in use there', async () => {
      const user = as('not introduced');
      const active = await get(`/resources/${SUPERVISED_MACHINE}/usage/active`, user);
      expect(active.status).toBe(200);
      expect(active.body.usage).toMatchObject({ id: 5, resourceId: SUPERVISED_MACHINE });
      expect(active.body.usage.user).toBeUndefined();
      expect(active.body.usage.userId).toBeUndefined();

      const event = await firstValueFrom(
        await sseController.streamEvents(SUPERVISED_MACHINE, {
          user: { id: ME, effectivePermissions: new Set(['resources.read']) },
        } as never),
      );
      expect(event.data).toEqual({ eventType: 'started', inUse: true, resourceId: SUPERVISED_MACHINE });
      expect(JSON.stringify(event)).not.toContain('operator');

      const source = await topics.source({ topic: 'resource', resourceId: SUPERVISED_MACHINE }, {
        id: ME,
        effectivePermissions: new Set(['resources.read']),
      } as unknown as AuthenticatedUser);
      expect(JSON.stringify(await firstValueFrom(source))).not.toContain('operator');
    });

    it('always shows people their own session', async () => {
      activeUsageOwner = ME;
      const user = as('not introduced');
      const active = await get(`/resources/${MACHINE}/usage/active`, user);
      expect(active.status).toBe(200);
      expect(active.body.usage.user.username).toBe('operator');
      expect((await get('/resources/in-use', user)).body.map((resource: Resource) => resource.id)).toContain(MACHINE);
      expect((await get(`/resources/${MACHINE}/usage/5`, user)).status).toBe(200);
    });

    it('lets people without activity access follow their own running session, and only that', async () => {
      activeUsageOwner = ME;
      const user = as('not introduced');
      expect(
        (
          await topics.authorize([{ topic: 'resource', resourceId: MACHINE }], {
            id: ME,
            effectivePermissions: new Set(['resources.read']),
          } as unknown as AuthenticatedUser)
        ).size,
      ).toBe(0);
      const live = await feed(MACHINE, user);
      expect(live.status).toBe(200);

      const viewer = { id: ME, effectivePermissions: new Set(['resources.read']) } as unknown as AuthenticatedUser;
      const events = new Subject<{ data: object }>();
      eventsService.subscribeResource.mockResolvedValueOnce(events);
      const seen: object[] = [];
      (await sseController.streamEvents(MACHINE, { user: viewer } as never)).subscribe((event) => seen.push(event));
      events.next({ data: { eventType: 'started', inUse: true, usage: { ...usage(), userId: OTHER } } });
      events.next({ data: { eventType: 'ended', inUse: false } });
      events.next({ data: { eventType: 'started', inUse: true, usage: usage() } });
      await new Promise((resolve) => setImmediate(resolve));
      expect(seen).toHaveLength(1);
    });

    it('lets someone eligible for a supervised session subscribe to the live topic there', async () => {
      const rejected = await topics.authorize([{ topic: 'resource', resourceId: SUPERVISED_MACHINE }], {
        id: ME,
        effectivePermissions: new Set(['resources.read']),
      } as unknown as AuthenticatedUser);
      expect(rejected.size).toBe(0);
      const live = await feed(SUPERVISED_MACHINE, as('not introduced'));
      expect(live.status).toBe(200);
      expect(live.text).toContain('"inUse":true');
      expect(live.text).not.toContain('operator');
    });

    it('shows the supervised-use machine on a resource read only as free/in use', async () => {
      const detail = await get(`/resources/${SUPERVISED_MACHINE}`, as('not introduced'));
      expect(detail.status).toBe(200);
      expect(detail.body.usages).toHaveLength(1);
      expect(JSON.stringify(detail.body)).not.toContain('operator');
      expect(detail.body.usages[0].userId).toBeUndefined();
    });

    it('drops events from an open feed for a viewer who has lost access', async () => {
      controllable = true;
      const user = { id: ME, effectivePermissions: new Set(['resources.read']) } as unknown as AuthenticatedUser;
      const events = new Subject<{ data: object }>();
      eventsService.subscribeResource.mockResolvedValueOnce(events);
      const seen: object[] = [];
      (await sseController.streamEvents(MACHINE, { user } as never)).subscribe((event) => seen.push(event));
      events.next({ data: { eventType: 'started', inUse: true, usage: usage() } });
      await new Promise((resolve) => setImmediate(resolve));
      controllable = false;
      events.next({ data: { eventType: 'started', inUse: true, usage: usage() } });
      await new Promise((resolve) => setImmediate(resolve));
      expect(seen).toHaveLength(1);
    });

    it('answers a real 403 over HTTP, not an SSE error frame, when the live feed is hidden', async () => {
      const response = await get(`/resources/${MACHINE}/events`, as('not introduced'));
      expect(response.status).toBe(403);
      expect(response.headers['content-type']).toContain('application/json');
      expect(eventsService.subscribeResource).not.toHaveBeenCalled();
    });
  });

  describe.each(['all', 'introduced'] as const)('usage history in "%s" mode', (visibility) => {
    it.each(Object.keys(PERSONAS))("%s: other people's history follows the shared visibility rule", async (name) => {
      mode = visibility;
      const user = as(name);
      const { permissions, canControl } = PERSONAS[name];
      const full =
        permissions.includes('resources.update') ||
        permissions.includes('resources.access.manage') ||
        (permissions.includes('resources.read') && (visibility === 'all' || canControl === true));
      const status = (await get(`/resources/${MACHINE}/usage/history?userId=${OTHER}`, user)).status;
      expect(status).toBe(full ? 200 : 403);
    });

    it("resource and access managers can open other people's sessions", async () => {
      mode = visibility;
      for (const name of ['manage resources', 'manage access']) {
        expect((await get(`/resources/${MACHINE}/usage/5`, as(name))).status).toBe(200);
      }
      expect(usageService.getSessionDetails).toHaveBeenCalledWith(MACHINE, 5, expect.anything(), true);
    });
  });

  it('pages through every in-use machine before filtering, not only the first page', async () => {
    mode = 'all';
    resourcesService.listResources
      .mockResolvedValueOnce({
        data: [{ id: MACHINE, name: 'Lathe', usages: [usage()] }] as unknown as Resource[],
        total: 101,
        page: 1,
        limit: 100,
      })
      .mockResolvedValueOnce({
        data: [
          { id: SUPERVISED_MACHINE, name: 'Mill', usages: [{ ...usage(), resourceId: SUPERVISED_MACHINE }] },
        ] as unknown as Resource[],
        total: 101,
        page: 2,
        limit: 100,
      });
    const list = await get('/resources/in-use', as('not introduced'));
    expect(list.body.map((resource: Resource) => resource.id)).toEqual([MACHINE, SUPERVISED_MACHINE]);
    expect(resourcesService.listResources).toHaveBeenCalledTimes(2);
  });
});
