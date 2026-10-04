import { type ExecutionContext, type INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DualAuthGuard } from '@attraccess/plugins-backend-sdk';
import { WagoUpdatesController } from './wago-updates.controller';
import { WagoManagedRuntimeService } from './wago-managed-runtime.service';
import { WagoNetworkChangeService } from './wago-network-change.service';

describe('administrator root recovery HTTP boundary', () => {
  let app: INestApplication;
  const recoverPassword = jest.fn(async () => ({ password: 'test-only-recovery-secret' }));
  const retryRuntime = jest.fn(async () => undefined);
  const networkStatus = {
    available: true,
    targetHost: '192.168.2.50',
    mqttServerId: 2,
    pendingCredentialRetirements: 0,
    operation: null,
  };
  const status = jest.fn(async () => networkStatus),
    apply = jest.fn(async () => networkStatus);
  const retirePreviousCredentials = jest.fn(async () => networkStatus);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [WagoUpdatesController],
      providers: [
        { provide: WagoManagedRuntimeService, useValue: { recoverPassword, retryRuntime } },
        { provide: WagoNetworkChangeService, useValue: { status, apply, retirePreviousCredentials } },
      ],
    })
      // The host supplies authentication. Exercise the plugin's real permission
      // guard and HTTP decorators with authenticated identities at that seam.
      .overrideGuard(DualAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest();
          if (!req.headers['x-test-identity']) throw new UnauthorizedException();
          req.user = {
            id: 7,
            authenticationMethod: 'session',
            effectivePermissions: new Set(req.headers['x-test-identity'] === 'admin' ? ['system.settings.manage'] : []),
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => {
    recoverPassword.mockClear();
    retryRuntime.mockClear();
    status.mockClear();
    apply.mockClear();
    retirePreviousCredentials.mockClear();
  });
  afterAll(() => app.close());

  it('restricts runtime retries to authenticated administrators', async () => {
    await request(app.getHttpServer()).post('/wago/controllers/1/runtime-update/retry').expect(401);
    await request(app.getHttpServer())
      .post('/wago/controllers/1/runtime-update/retry')
      .set('x-test-identity', 'operator')
      .expect(403);
    expect(retryRuntime).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post('/wago/controllers/1/runtime-update/retry')
      .set('x-test-identity', 'admin')
      .expect(201);
    expect(retryRuntime).toHaveBeenCalledWith(1);
  });

  it.each(['', '/retry', '/retire-credentials'])(
    'restricts network change %s to authenticated administrators',
    async (suffix) => {
      const path = `/wago/controllers/1/network-change${suffix}`;
      await request(app.getHttpServer()).post(path).send({ targetHost: '192.168.2.50', mqttServerId: 2 }).expect(401);
      await request(app.getHttpServer())
        .post(path)
        .set('x-test-identity', 'operator')
        .send({ targetHost: '192.168.2.50', mqttServerId: 2 })
        .expect(403);
      expect(apply).not.toHaveBeenCalled();
      expect(retirePreviousCredentials).not.toHaveBeenCalled();
    },
  );

  it('restricts network status and forwards safe administrator requests with their audit actor', async () => {
    const path = '/wago/controllers/1/network-change';
    await request(app.getHttpServer()).get(path).expect(401);
    await request(app.getHttpServer()).get(path).set('x-test-identity', 'operator').expect(403);
    expect(status).not.toHaveBeenCalled();
    const input = { targetHost: '192.168.2.50', mqttServerId: 2 };
    const response = await request(app.getHttpServer())
      .post(path)
      .set('x-test-identity', 'admin')
      .send(input)
      .expect(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual(networkStatus);
    expect(apply).toHaveBeenCalledWith(1, input, { userId: 7, authenticationMethod: 'session' });
    await request(app.getHttpServer())
      .post(path + '/retry')
      .set('x-test-identity', 'admin')
      .expect(201);
    expect(apply).toHaveBeenCalledWith(1, null, { userId: 7, authenticationMethod: 'session' }, true);
  });

  it('denies anonymous and non-administrator requests before secret disclosure', async () => {
    await request(app.getHttpServer())
      .post('/wago/commissioning/sessions/1/root-recovery')
      .send({ confirm: true })
      .expect(401);
    await request(app.getHttpServer())
      .post('/wago/commissioning/sessions/1/root-recovery')
      .set('x-test-identity', 'operator')
      .send({ confirm: true })
      .expect(403);
    expect(recoverPassword).not.toHaveBeenCalled();
  });

  it('requires explicit disclosure confirmation even for an administrator', async () => {
    await request(app.getHttpServer())
      .post('/wago/commissioning/sessions/1/root-recovery')
      .set('x-test-identity', 'admin')
      .send({})
      .expect(400);
    expect(recoverPassword).not.toHaveBeenCalled();
  });

  it('returns only the recovery password with cache prevention and the authenticated audit actor', async () => {
    const response = await request(app.getHttpServer())
      .post('/wago/commissioning/sessions/1/root-recovery')
      .set('x-test-identity', 'admin')
      .send({ confirm: true })
      .expect(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.pragma).toBe('no-cache');
    expect(response.body).toEqual({ password: 'test-only-recovery-secret' });
    expect(recoverPassword).toHaveBeenCalledWith(1, { userId: 7, authenticationMethod: 'session' });
  });
});
