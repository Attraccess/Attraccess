import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { PreStartService as HostPreStartService } from '../../../api/src/resources/usage/pre-start/pre-start.service';
import { WebStartStepStore } from '../../../api/src/resources/usage/pre-start/web-start-step.store';
import { ResourceActivityVisibilityService } from '../../../api/src/resources/usage/authorization/resource-activity-visibility.service';
import { ResourceUsageController } from '../../../api/src/resources/usage/sessions/resource-usage.controller';
import { ResourceUsageService } from '../../../api/src/resources/usage/sessions/resource-usage.service';
import { SessionEndNotifier } from '../../../api/src/resources/usage/pre-start/session-end-notifier.service';
import { ReaderUiHooksService } from '../../../api/src/plugin-system/reader-ui/reader-ui-hooks.service';
import { ReservationEntity } from '../backend/entities/reservation.entity';
import { preStartHook, publishHookServices, startBlockedQuery } from '../backend/hooks/runtime';
import { createBackgroundServices } from '../backend/testing/background-services.test-utils';
import { Harness, createHarness } from '../backend/testing/harness.test-utils';

const NOW = new Date('2026-06-01T12:30:00.000Z');
const HOLDER = 10;
const OTHER = 11;
const MANAGER = 99;
/** Holds resources.update through a role, without a maintainer or introducer role on the resource. */
const UPDATER = 98;

type Principal = { id: number; authenticationMethod: 'session' | 'api-token'; apiTokenId?: number; scope?: string[] };
let principal: Principal = { id: OTHER, authenticationMethod: 'session' };

/** The request user core's auth builds: `effectivePermissions` is the session's set or the API token's scope. */
class FakeAuth implements CanActivate {
  canActivate(context: ExecutionContext) {
    const { scope = ['resources.read', 'resources.update'], ...user } = principal;
    context.switchToHttp().getRequest().user = { locale: 'en', effectivePermissions: new Set(scope), ...user };
    return true;
  }
}

const as = (id: number, via: 'session' | 'api-token'): Principal =>
  via === 'session'
    ? { id, authenticationMethod: 'session' }
    : { id, authenticationMethod: 'api-token', apiTokenId: 31 };

/**
 * The host's real start path with the real reservations plugin behind it: HTTP controller, PreStartService,
 * ReaderUiHooksService (timeout, breaker, validation), the web step store, and the plugin's own hook functions on a
 * real SQLite database. Only core's usage service (the session itself), the user lookup and the plugin registry
 * wiring are stubbed.
 */
describe.each([['session' as const], ['api-token' as const]])('host start gate with reservations (%s)', (via) => {
  let h: Harness;
  let app: INestApplication;
  const startSession = jest.fn();
  let failurePolicy: 'fail-closed' | 'fail-open';
  let pluginLoaded: boolean;
  let pluginBroken: boolean;

  const start = (body: object = {}) => request(app.getHttpServer()).post('/resources/1/usage/start').send(body);
  const sessionStartedFor = () => startSession.mock.calls.map((call) => call[1].id);

  beforeEach(async () => {
    // Only Date is faked (the host stamps hook calls with `new Date()`); timers stay real for HTTP and the hook timeout.
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'setImmediate',
        'clearImmediate',
        'nextTick',
        'queueMicrotask',
        'hrtime',
        'performance',
      ],
    });
    h = await createHarness();
    await h.enable(1, { confirmWindowMinutes: 60 });
    await h.settings.warmUp();
    h.makeManager(MANAGER, 1);
    const services = createBackgroundServices(h);
    publishHookServices({ preStart: services.preStart, sessionEnd: services.sessionEnd, readerUi: services.readerUi });
    // Booked ahead of time (the harness clock starts at 08:00), then the clock moves into the booking.
    await services.book(HOLDER, 1, '2026-06-01T12:00:00', '2026-06-01T14:00:00');
    h.setNow(NOW);

    failurePolicy = 'fail-closed';
    pluginLoaded = true;
    pluginBroken = false;
    const hook: typeof preStartHook = async (ctx) => {
      if (pluginBroken) throw new Error('plugin crashed');
      return preStartHook(ctx);
    };
    // A quarantined or unloaded plugin contributes no hooks at all.
    const registry = {
      preStartHooks: () => (pluginLoaded ? [{ plugin: 'reservations', hook }] : []),
      startBlockedQueries: () => (pluginLoaded ? [{ plugin: 'reservations', query: startBlockedQuery }] : []),
      sessionEndHooks: () => [],
    };
    const hooks = new ReaderUiHooksService(
      registry as never,
      { failurePolicy: async () => failurePolicy } as never,
      { onCleared: () => undefined, raise: async () => ({}), clearWhere: async () => undefined } as never,
      { recordAttractap: async () => undefined } as never,
      { get: () => ({}) } as never,
    );
    const hostPreStart = new HostPreStartService(
      { precheckStart: async () => undefined } as never,
      hooks,
      new WebStartStepStore({ recordAttractap: async () => undefined, record: async () => undefined } as never),
      { resolveLanguage: async () => 'en' } as never,
    );
    startSession.mockReset().mockResolvedValue({ id: 500 });
    const moduleRef = await Test.createTestingModule({
      controllers: [ResourceUsageController],
      providers: [
        { provide: ResourceUsageService, useValue: { startSession } },
        { provide: ResourceActivityVisibilityService, useValue: {} },
        { provide: HostPreStartService, useValue: hostPreStart },
        { provide: SessionEndNotifier, useValue: {} },
      ],
    })
      .overrideGuard(DualAuthGuard)
      .useClass(FakeAuth)
      .overrideGuard(EffectivePermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    publishHookServices(null);
    await h.close();
    jest.useRealTimers();
  });

  it('blocks another user during a running booking: 403 START_BLOCKED, anonymous text, no session', async () => {
    principal = as(OTHER, via);
    const response = await start();
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'START_BLOCKED',
      reason: { code: 'RESERVED', title: 'Reserved', body: 'Reserved by another user until 16:00.' },
    });
    expect(JSON.stringify(response.body)).not.toContain('user10');
    expect(startSession).not.toHaveBeenCalled();
  });

  it('names the holder in the same block for a viewer who may see the machine’s current user', async () => {
    h.allowAttribution(OTHER, 1);
    principal = as(OTHER, via);
    const response = await start();
    expect(response.status).toBe(403);
    expect(response.body.reason.body).toBe('Reserved by user10 until 16:00.');
  });

  it('reports the same reason and end time to the resource UI before any start is tried', async () => {
    principal = as(OTHER, via);
    const gate = await start();
    const state = await request(app.getHttpServer()).get('/resources/1/usage/start-blocked');
    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({
      blocked: true,
      plugin: 'reservations',
      reason: gate.body.reason,
      until: '2026-06-01T14:00:00.000Z',
    });
    principal = as(HOLDER, via);
    expect((await request(app.getHttpServer()).get('/resources/1/usage/start-blocked')).body).toEqual({
      blocked: false,
    });
  });

  it('lets the holder start', async () => {
    principal = as(HOLDER, via);
    expect((await start()).status).toBe(201);
    expect(sessionStartedFor()).toEqual([HOLDER]);
  });

  it('asks a manager to confirm (409, naming the holder), then starts on the retry with the step id', async () => {
    principal = as(MANAGER, via);
    const asked = await start();
    expect(asked.status).toBe(409);
    expect(asked.body).toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
      confirmation: { title: 'Reserved', body: 'Reserved by user10 until 16:00. Start anyway?', tone: 'danger' },
    });
    expect(startSession).not.toHaveBeenCalled();

    const retried = await start({ confirmedStepIds: [asked.body.stepId] });
    expect(retried.status).toBe(201);
    expect(sessionStartedFor()).toEqual([MANAGER]);
  });

  it('applies an API token’s scope in the plugin: without resources.update there is no override, only the block', async () => {
    h.grant(UPDATER, 'resources.update');
    principal = as(UPDATER, via);
    expect((await start()).status).toBe(409);

    principal = { ...as(UPDATER, 'api-token'), scope: ['resources.read'] };
    const refused = await start();
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ code: 'START_BLOCKED', reason: { code: 'RESERVED' } });
    const state = await request(app.getHttpServer()).get('/resources/1/usage/start-blocked');
    expect(state.body).toMatchObject({ blocked: true, reason: refused.body.reason });
    expect(startSession).not.toHaveBeenCalled();
  });

  it('accepts a step id once only, and only from the principal it was issued to', async () => {
    principal = as(MANAGER, via);
    const { body } = await start();
    expect((await start({ confirmedStepIds: [body.stepId] })).status).toBe(201);
    // A spent step id is refused by the host as invalid; nothing starts.
    expect((await start({ confirmedStepIds: [body.stepId] })).status).toBe(400);

    const next = (await start()).body.stepId;
    // The same user through the other kind of principal cannot spend it.
    principal = as(MANAGER, via === 'session' ? 'api-token' : 'session');
    expect((await start({ confirmedStepIds: [next] })).status).toBe(400);
    expect(sessionStartedFor()).toEqual([MANAGER]);
  });

  it('asks everyone, managers included, before a booking that starts soon, then starts on the retry', async () => {
    h.setNow('2026-06-01T11:30:00Z');
    jest.setSystemTime(new Date('2026-06-01T11:30:00Z'));
    principal = as(OTHER, via);
    const asked = await start();
    expect(asked.status).toBe(409);
    expect(asked.body.confirmation).toMatchObject({ title: 'Reserved soon', tone: 'warning' });
    const retried = await start({ confirmedStepIds: [asked.body.stepId] });
    expect(retried.status).toBe(201);
  });

  it('does not block once the booking is cancelled or ended', async () => {
    await h.dataSource.getRepository(ReservationEntity).update({ userId: HOLDER }, { status: 'cancelled' });
    principal = as(OTHER, via);
    expect((await start()).status).toBe(201);
  });

  it('refuses a start while the plugin cannot answer (fail-closed), never starting a session', async () => {
    publishHookServices(null);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    principal = as(OTHER, via);
    // The plugin never published its services: the hook waits out its budget, then the host policy applies.
    const response = await start();
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'START_BLOCKED', reason: { code: 'HOOK_UNAVAILABLE' } });
    expect(startSession).not.toHaveBeenCalled();
  }, 15_000);

  describe('when the plugin fails or is quarantined', () => {
    const startOn = (resourceId: number) =>
      request(app.getHttpServer()).post(`/resources/${resourceId}/usage/start`).send({});

    it('refuses every start, also on resources without reservations, while a crashing hook runs under the default fail-closed policy', async () => {
      pluginBroken = true;
      jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      principal = as(OTHER, via);
      for (const resourceId of [1, 2]) {
        const response = await startOn(resourceId);
        expect(response.status).toBe(403);
        expect(response.body.reason.code).toBe('HOOK_UNAVAILABLE');
      }
      expect(startSession).not.toHaveBeenCalled();
    });

    it('lets starts through when an admin set the resource to fail-open (the only way a crashing plugin stops blocking)', async () => {
      pluginBroken = true;
      failurePolicy = 'fail-open';
      principal = as(OTHER, via);
      expect((await startOn(2)).status).toBe(201);
    });

    it('answers a resource without reservations from memory, so a healthy plugin never blocks it', async () => {
      principal = as(OTHER, via);
      expect((await startOn(2)).status).toBe(201);
    });

    it('starts without any hook once the plugin is quarantined: nothing is blocked, reserved resources included', async () => {
      pluginLoaded = false;
      principal = as(OTHER, via);
      expect((await startOn(2)).status).toBe(201);
      expect((await startOn(1)).status).toBe(201);
      expect((await request(app.getHttpServer()).get('/resources/1/usage/start-blocked')).body).toEqual({
        blocked: false,
      });
    });
  });
});
