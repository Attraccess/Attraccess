import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { NetworkIpSource, NetworkRestrictedAction } from '@attraccess/application-models';
import { ResourceUsageController } from '../resources/usage/sessions/resource-usage.controller';
import { ResourceUsageService } from '../resources/usage/sessions/resource-usage.service';
import { ResourceActivityVisibilityService } from '../resources/usage/authorization/resource-activity-visibility.service';
import { SessionEndNotifier } from '../resources/usage/pre-start/session-end-notifier.service';
import { PreStartService } from '../resources/usage/pre-start/pre-start.service';
import { SupervisionController } from '../resources/supervision/supervision.controller';
import { SupervisionService } from '../resources/supervision/supervision.service';
import { SupervisionLiveService } from '../resources/supervision/supervision-live.service';
import { SseInstrumentation } from '../metrics/instrumentation/sse/sse.helper';
import { NetworkRestrictionConfigService } from './network-restriction-config.service';
import { NetworkRestrictionService } from './network-restriction.service';
import { NETWORK_RESTRICTION_STORE } from './network-restriction.port';
import type { NetworkRestrictionConfig } from './network-restriction.config';

let allowedForUser: NetworkRestrictedAction[] = [];
let accessOnlyDoor = false;

class FakeAuth implements CanActivate {
  canActivate(context: ExecutionContext) {
    context.switchToHttp().getRequest().user = {
      id: 7,
      effectivePermissions: new Set(),
      locale: 'en',
      authenticationMethod: 'api-token',
      apiTokenId: 3,
    };
    return true;
  }
}

/** Every call that changes something. A refused request must reach none of them. */
const sideEffects = {
  gateHttp: jest.fn(),
  startSession: jest.fn(),
  endSession: jest.fn(),
  lockDoor: jest.fn(),
  unlockDoor: jest.fn(),
  unlatchDoor: jest.fn(),
  openDoor: jest.fn(),
  requestSupervisedSession: jest.fn(),
  approve: jest.fn(),
  reject: jest.fn(),
};

const OUTSIDE = { 'x-forwarded-for': '203.0.113.9' };

describe('network restriction on the resource action endpoints', () => {
  let app: INestApplication;
  let config: NetworkRestrictionConfig;
  let trustProxy: boolean;

  beforeEach(async () => {
    allowedForUser = [];
    accessOnlyDoor = false;
    config = {
      enabled: true,
      allowedRanges: ['10.0.0.0/8', '127.0.0.0/8', '::1/128'],
      ipSource: NetworkIpSource.Header,
      headerName: 'X-Real-Ip',
    };
    trustProxy = false;
    for (const mock of Object.values(sideEffects)) mock.mockReset().mockResolvedValue({ id: 1, userId: 7 });
    const moduleRef = await Test.createTestingModule({
      controllers: [ResourceUsageController, SupervisionController],
      providers: [
        NetworkRestrictionService,
        { provide: NetworkRestrictionConfigService, useValue: new NetworkRestrictionConfigService({} as never) },
        {
          provide: NETWORK_RESTRICTION_STORE,
          useValue: { actionsAllowedForUser: async () => allowedForUser },
        },
        {
          provide: ResourceUsageService,
          useValue: { ...sideEffects, isAccessOnlyDoor: async () => accessOnlyDoor },
        },
        { provide: ResourceActivityVisibilityService, useValue: {} },
        { provide: PreStartService, useValue: { gateHttp: sideEffects.gateHttp } },
        { provide: SessionEndNotifier, useValue: { applyDefault: jest.fn() } },
        { provide: SupervisionService, useValue: { ...sideEffects, pendingResourceId: () => 5 } },
        { provide: SupervisionLiveService, useValue: {} },
        { provide: SseInstrumentation, useValue: {} },
      ],
    })
      .overrideGuard(DualAuthGuard)
      .useClass(FakeAuth)
      .overrideGuard(EffectivePermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    jest.spyOn(moduleRef.get(NetworkRestrictionConfigService), 'get').mockImplementation(async () => config);
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app
      .getHttpAdapter()
      .getInstance()
      .set('trust proxy', () => trustProxy);
    await app.init();
  });

  afterEach(() => app.close());

  const endpoints: Array<{
    action: NetworkRestrictedAction;
    method: 'post' | 'put';
    path: string;
    body?: object;
    effect: keyof typeof sideEffects;
  }> = [
    {
      action: NetworkRestrictedAction.UsageStart,
      method: 'post',
      path: '/resources/5/usage/start',
      body: {},
      effect: 'startSession',
    },
    {
      action: NetworkRestrictedAction.UsageTakeover,
      method: 'post',
      path: '/resources/5/usage/start',
      body: { forceTakeOver: true },
      effect: 'startSession',
    },
    {
      action: NetworkRestrictedAction.UsageEnd,
      method: 'put',
      path: '/resources/5/usage/end',
      body: {},
      effect: 'endSession',
    },
    { action: NetworkRestrictedAction.DoorOpen, method: 'post', path: '/resources/5/usage/open', effect: 'openDoor' },
    {
      action: NetworkRestrictedAction.DoorUnlock,
      method: 'post',
      path: '/resources/5/usage/unlock',
      effect: 'unlockDoor',
    },
    {
      action: NetworkRestrictedAction.DoorUnlatch,
      method: 'post',
      path: '/resources/5/usage/unlatch',
      effect: 'unlatchDoor',
    },
    { action: NetworkRestrictedAction.DoorLock, method: 'post', path: '/resources/5/usage/lock', effect: 'lockDoor' },
    {
      action: NetworkRestrictedAction.SupervisionRequest,
      method: 'post',
      path: '/resources/5/usage/supervision/request',
      body: { supervisorId: 2 },
      effect: 'requestSupervisedSession',
    },
    {
      action: NetworkRestrictedAction.SupervisionApprove,
      method: 'post',
      path: '/resources/supervision/requests/abc/approve',
      effect: 'approve',
    },
  ];

  const send = (e: (typeof endpoints)[number], headers: Record<string, string> = {}) => {
    const call = request(app.getHttpServer())[e.method](e.path).set(headers);
    return e.body ? call.send(e.body) : call;
  };

  describe.each(endpoints)('$action ($method $path)', (endpoint) => {
    it('is refused from outside with NETWORK_RESTRICTED before any side effect', async () => {
      const response = await send(endpoint, { 'x-real-ip': '203.0.113.9' });
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        code: 'NETWORK_RESTRICTED',
        message: 'NETWORK_RESTRICTED',
        action: endpoint.action,
      });
      for (const [name, mock] of Object.entries(sideEffects)) expect([name, mock.mock.calls.length]).toEqual([name, 0]);
    });

    it('is refused when the header is missing (fail closed)', async () => {
      expect((await send(endpoint)).status).toBe(403);
      expect(sideEffects[endpoint.effect]).not.toHaveBeenCalled();
    });

    it('works from the allowed network', async () => {
      const response = await send(endpoint, { 'x-real-ip': '10.1.2.3' });
      expect(response.status).toBeLessThan(300);
      expect(sideEffects[endpoint.effect]).toHaveBeenCalledTimes(1);
    });

    it('works from outside when a role of the user allows exactly this action', async () => {
      allowedForUser = [endpoint.action];
      const response = await send(endpoint, { 'x-real-ip': '203.0.113.9' });
      expect(response.status).toBeLessThan(300);
      expect(sideEffects[endpoint.effect]).toHaveBeenCalledTimes(1);
    });

    it('behaves as before while the restriction is off', async () => {
      config.enabled = false;
      expect((await send(endpoint, { 'x-real-ip': '203.0.113.9' })).status).toBeLessThan(300);
    });
  });

  it('judges a takeover as usage.takeover, not usage.start', async () => {
    allowedForUser = [NetworkRestrictedAction.UsageStart];
    const takeover = await request(app.getHttpServer())
      .post('/resources/5/usage/start')
      .set('x-real-ip', '203.0.113.9')
      .send({ forceTakeOver: true });
    expect(takeover.status).toBe(403);
    expect(takeover.body.action).toBe('usage.takeover');
    const plain = await request(app.getHttpServer())
      .post('/resources/5/usage/start')
      .set('x-real-ip', '203.0.113.9')
      .send({ forceTakeOver: false });
    expect(plain.status).toBe(201);
  });

  it('judges a supervised takeover request as usage.takeover too', async () => {
    allowedForUser = [NetworkRestrictedAction.SupervisionRequest];
    const takeover = await request(app.getHttpServer())
      .post('/resources/5/usage/supervision/request')
      .set('x-real-ip', '203.0.113.9')
      .send({ forceTakeOver: true, readerId: 3 });
    expect(takeover.status).toBe(403);
    expect(takeover.body.action).toBe('usage.takeover');
    expect(sideEffects.requestSupervisedSession).not.toHaveBeenCalled();

    allowedForUser = [NetworkRestrictedAction.SupervisionRequest, NetworkRestrictedAction.UsageTakeover];
    const allowed = await request(app.getHttpServer())
      .post('/resources/5/usage/supervision/request')
      .set('x-real-ip', '203.0.113.9')
      .send({ forceTakeOver: true, readerId: 3 });
    expect(allowed.status).toBe(201);
  });

  it('judges an unlock of an access-only door as door.open, because it opens the door', async () => {
    accessOnlyDoor = true;
    allowedForUser = [NetworkRestrictedAction.DoorUnlock];
    const refused = await request(app.getHttpServer())
      .post('/resources/5/usage/unlock')
      .set('x-real-ip', '203.0.113.9');
    expect(refused.status).toBe(403);
    expect(refused.body.action).toBe('door.open');
    expect(sideEffects.unlockDoor).not.toHaveBeenCalled();

    allowedForUser = [NetworkRestrictedAction.DoorOpen];
    const allowed = await request(app.getHttpServer())
      .post('/resources/5/usage/unlock')
      .set('x-real-ip', '203.0.113.9');
    expect(allowed.status).toBe(201);
  });

  it('does not run the pre-start gate for a refused start', async () => {
    await request(app.getHttpServer()).post('/resources/5/usage/start').set('x-real-ip', '203.0.113.9').send({});
    expect(sideEffects.gateHttp).not.toHaveBeenCalled();
  });

  it('never blocks rejecting a supervision request', async () => {
    sideEffects.reject.mockReturnValue({ status: 'rejected' });
    const response = await request(app.getHttpServer())
      .post('/resources/supervision/requests/abc/reject')
      .set('x-real-ip', '203.0.113.9');
    expect(response.status).toBe(201);
    expect(sideEffects.reject).toHaveBeenCalledTimes(1);
  });

  describe('client mode', () => {
    beforeEach(() => {
      config.ipSource = NetworkIpSource.Client;
    });

    it('ignores X-Forwarded-For and the header without trust proxy', async () => {
      // supertest connects from loopback, which is allowed; a forged forwarded address changes nothing.
      const response = await request(app.getHttpServer())
        .post('/resources/5/usage/unlock')
        .set({ ...OUTSIDE, 'x-real-ip': '203.0.113.9' });
      expect(response.status).toBe(201);
    });

    it('uses the forwarded client address when the proxy is trusted', async () => {
      trustProxy = true;
      const outside = await request(app.getHttpServer()).post('/resources/5/usage/unlock').set(OUTSIDE);
      expect(outside.status).toBe(403);
      const inside = await request(app.getHttpServer())
        .post('/resources/5/usage/unlock')
        .set('x-forwarded-for', '10.4.4.4');
      expect(inside.status).toBe(201);
    });
  });
});
