import { type ExecutionContext, type INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DualAuthGuard } from '@attraccess/plugins-backend-sdk';
import { WagoUpdatesController } from './wago-updates.controller';
import { WagoManagedRuntimeService } from './wago-managed-runtime.service';

describe('administrator root recovery HTTP boundary', () => {
  let app: INestApplication;
  const recoverPassword = jest.fn(async () => ({ password: 'test-only-recovery-secret' }));
  const retryRuntime = jest.fn(async () => undefined);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [WagoUpdatesController],
      providers: [{ provide: WagoManagedRuntimeService, useValue: { recoverPassword, retryRuntime } }],
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
