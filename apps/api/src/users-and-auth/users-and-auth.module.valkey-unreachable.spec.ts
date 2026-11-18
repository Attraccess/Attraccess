import { AuthenticationType, entities, User } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AuditModule } from '../audit/audit.module';
import { SecurityModule } from '../common/security/security.module';
import appConfiguration, { AppConfigType } from '../config/app.config';
import sessionConfig from '../config/session.config';
import storageConfigObject from '../config/storage.config';
import valkeyConfig from '../config/valkey.config';
import { configureBootstrapHttp } from '../main.bootstrap';
import { MetricsModule } from '../metrics/metrics.module';
import { unreachableValkeyUrl } from '../valkey/unreachable-valkey.test-fixture';
import { VALKEY_UNAVAILABLE_MESSAGE } from '../valkey/valkey-unavailable';
import { ValkeyModule } from '../valkey/valkey.module';
import { AuthService } from './auth/auth.service';
import { UsersAndAuthModule } from './users-and-auth.module';

process.env.AUTH_SESSION_SECRET ??= 'boot-spec-session-secret-0123456789abcdef';

const PASSWORD = 'valkey-boot-spec-password';

// ATT-1244: with VALKEY_URL set and Valkey down, a real ioredis client fails every command with
// MaxRetriesPerRequestError. The API must still start and answer 503 where it needs Valkey.
describe('UsersAndAuthModule with Valkey configured but unreachable', () => {
  const previousValkeyUrl = process.env.VALKEY_URL;
  let app: NestExpressApplication;
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;
  let error: jest.SpyInstance;
  let consoleError: jest.SpyInstance;
  const unhandledRejections: unknown[] = [];
  const recordUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);

  beforeAll(async () => {
    process.env.VALKEY_URL = await unreachableValkeyUrl(PASSWORD);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    // The shared client's per-retry error line belongs to ATT-1242.
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    // ioredis reports an error event nobody listens to here as "[ioredis] Unhandled error event".
    consoleError = jest.spyOn(console, 'error');
    process.on('unhandledRejection', recordUnhandledRejection);

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [appConfiguration, storageConfigObject, sessionConfig, valkeyConfig],
          isGlobal: true,
        }),
        EventEmitterModule.forRoot(),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          synchronize: true,
          entities: Object.values(entities),
        }),
        MetricsModule,
        ValkeyModule,
        AuditModule,
        SecurityModule,
        UsersAndAuthModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureBootstrapHttp(app, {} as AppConfigType, new Logger('Bootstrap'));
  });

  afterAll(async () => {
    process.off('unhandledRejection', recordUnhandledRejection);
    await app?.close();
    if (previousValkeyUrl === undefined) delete process.env.VALKEY_URL;
    else process.env.VALKEY_URL = previousValkeyUrl;
    jest.restoreAllMocks();
  });

  it('starts, warning once that the session store (Valkey) is unreachable', async () => {
    await expect(app.init()).resolves.toBe(app);

    // Counting sessions does not hold up startup, so its warning follows shortly after.
    const countWarnings = () =>
      warn.mock.calls
        .map(([message]) => String(message))
        .filter((message) => message.includes('count active sessions'));
    while (countWarnings().length === 0) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(countWarnings()).toEqual([expect.stringContaining('Valkey is unreachable')]);
  });

  it('answers 503 instead of 500 when signing in with valid credentials', async () => {
    // Directly in the database: creating users through the service needs a license key.
    const user = await app.get(DataSource).getRepository(User).save({
      username: 'valkey-down',
      email: 'valkey-down@example.com',
      isEmailVerified: true,
    });
    await app.get(AuthService).addAuthenticationDetails(user.id, {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: { password: 'correct-horse' },
    });

    const signIn = (password: string) =>
      request(app.getHttpServer())
        .post('/auth/session/local')
        .send({ username: 'valkey-down', password, tokenLocation: 'body' });

    expect((await signIn('wrong-password')).status).toBe(401);
    const response = await signIn('correct-horse');
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ statusCode: 503, message: VALKEY_UNAVAILABLE_MESSAGE });
  });

  it.each([
    ['GET', '/auth/session/logout-capability', 'Authorization', 'Bearer some-session-token'],
    ['POST', '/auth/session/refresh', 'Authorization', 'Bearer some-session-token'],
    ['DELETE', '/auth/session', 'Authorization', 'Bearer some-session-token'],
    ['GET', '/auth/session/logout-capability', 'Cookie', 'auth-session=some-session-token'],
  ])('answers 503 instead of 500 for %s %s with a session token in %s', async (method, path, header, value) => {
    const response = await request(app.getHttpServer())
      [method.toLowerCase() as 'get' | 'post' | 'delete'](path)
      .set(header, value);

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ statusCode: 503, message: VALKEY_UNAVAILABLE_MESSAGE });
  });

  it('still answers 401 without a session token', async () => {
    const response = await request(app.getHttpServer()).get('/auth/session/logout-capability');

    expect(response.status).toBe(401);
  });

  it('lets no Valkey error escape and never logs the Valkey password', () => {
    expect(unhandledRejections).toEqual([]);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('ioredis');
    expect(JSON.stringify([warn.mock.calls, log.mock.calls, error.mock.calls])).not.toContain(PASSWORD);
  });
});
