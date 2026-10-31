import { ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthenticatedRequest, DualAuthGuard, User } from '@attraccess/plugins-backend-sdk';
import request from 'supertest';
import { LicenseGuard } from '../license/license.guard';
import { EnrollmentRateLimitedException } from '../device-enrollment/enrollment-rate-limited.exception';
import { AttractapPairingController } from './pairing.controller';
import { CredentialRegistryService } from './security/credential-registry.service';
import { PairingService } from './security/pairing.service';
import { WebsocketService } from './websockets/websocket.service';

describe('AttractapPairingController authorization and throttling', () => {
  let app: INestApplication;
  const pairing = {
    list: jest.fn(),
    get: jest.fn(),
    resolve: jest.fn(),
    approve: jest.fn(),
    cancel: jest.fn(),
    revoke: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AttractapPairingController],
      providers: [
        { provide: PairingService, useValue: pairing },
        { provide: CredentialRegistryService, useValue: { history: jest.fn() } },
        { provide: WebsocketService, useValue: { sockets: new Map() } },
      ],
    })
      .overrideGuard(LicenseGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(DualAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
          if (!req.headers['x-test-user']) throw new UnauthorizedException();
          const viaToken = req.headers['x-test-token'] === '1';
          req.user = Object.assign(new User(), {
            id: Number(req.headers['x-test-user']),
            jwtTokenId: 'test',
            authenticationMethod: viaToken ? 'api-token' : 'session',
            apiTokenId: viaToken ? 9 : undefined,
            effectivePermissions: new Set(String(req.headers['x-test-permissions'] ?? '').split(',')),
          });
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app.close());

  const call = (method: 'get' | 'post' | 'delete', path: string) => request(app.getHttpServer())[method](path);
  const endpoints: Array<['get' | 'post' | 'delete', string]> = [
    ['get', '/attractap/pairings'],
    ['get', '/attractap/pairings/abc'],
    ['post', '/attractap/pairings/resolve'],
    ['post', '/attractap/pairings/abc/approve'],
    ['delete', '/attractap/pairings/abc'],
    ['post', '/attractap/readers/4/revoke'],
    ['post', '/attractap/readers/4/pair'],
    ['get', '/attractap/readers/4/credentials'],
  ];

  it.each(endpoints)('%s %s: 401 without sign-in', async (method, path) => {
    await call(method, path).send({}).expect(401);
  });

  it.each(endpoints)('%s %s: 403 without resources.update', async (method, path) => {
    await call(method, path).set('x-test-user', '1').set('x-test-permissions', 'resources.read').send({}).expect(403);
  });

  it('resolves a code for a session and for an API token', async () => {
    pairing.resolve.mockReturnValue({ id: 'p1' });
    await call('post', '/attractap/pairings/resolve')
      .set('x-test-user', '1')
      .set('x-test-permissions', 'resources.update')
      .send({ code: 'K7P-3XQ' })
      .expect(200);
    expect(pairing.resolve).toHaveBeenLastCalledWith('K7P-3XQ', { userId: 1, authenticationMethod: 'session' });

    await call('post', '/attractap/pairings/resolve')
      .set('x-test-user', '2')
      .set('x-test-token', '1')
      .set('x-test-permissions', 'resources.update')
      .send({ code: 'K7P3XQ' })
      .expect(200);
    expect(pairing.resolve).toHaveBeenLastCalledWith('K7P3XQ', {
      userId: 2,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
    });
  });

  it('approves through an API token and passes the body on', async () => {
    pairing.approve.mockResolvedValue({ id: 'p1', state: 'completed' });
    await call('post', '/attractap/pairings/p1/approve')
      .set('x-test-user', '2')
      .set('x-test-token', '1')
      .set('x-test-permissions', 'resources.update')
      .send({ code: 'K7P3XQ', mode: 'new', name: 'Laser' })
      .expect(200);
    expect(pairing.approve).toHaveBeenCalledWith(
      'p1',
      { code: 'K7P3XQ', mode: 'new', name: 'Laser' },
      { userId: 2, authenticationMethod: 'api-token', apiTokenId: 9 },
    );
  });

  it('records who cancelled a pairing', async () => {
    await call('delete', '/attractap/pairings/p1')
      .set('x-test-user', '3')
      .set('x-test-permissions', 'resources.update')
      .expect(204);
    expect(pairing.cancel).toHaveBeenCalledWith('p1', { userId: 3, authenticationMethod: 'session' });
  });

  it('rejects an invalid approve body', async () => {
    const send = (body: object) =>
      call('post', '/attractap/pairings/p1/approve')
        .set('x-test-user', '1')
        .set('x-test-permissions', 'resources.update')
        .send(body);
    await send({ mode: 'repair' }).expect(400);
    await send({ mode: 'new', name: 'x'.repeat(65) }).expect(400);
    expect(pairing.approve).not.toHaveBeenCalled();
  });

  it('answers 429 with the seconds to wait on both resolve and approve', async () => {
    pairing.resolve.mockImplementation(() => {
      throw new EnrollmentRateLimitedException(42);
    });
    pairing.approve.mockRejectedValue(new EnrollmentRateLimitedException(42));
    const headers = { 'x-test-user': '1', 'x-test-permissions': 'resources.update' };
    const resolved = await call('post', '/attractap/pairings/resolve').set(headers).send({ code: 'AAAAAA' }).expect(429);
    expect(resolved.body).toMatchObject({ message: 'EnrollmentRateLimited', retryAfterSeconds: 42 });
    await call('post', '/attractap/pairings/p1/approve').set(headers).send({ code: 'AAAAAA', mode: 'new' }).expect(429);
  });
});
