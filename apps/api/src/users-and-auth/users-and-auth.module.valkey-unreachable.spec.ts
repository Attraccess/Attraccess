import { entities } from '@attraccess/database-entities';
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { AuditModule } from '../audit/audit.module';
import { SecurityModule } from '../common/security/security.module';
import appConfiguration from '../config/app.config';
import sessionConfig from '../config/session.config';
import storageConfigObject from '../config/storage.config';
import valkeyConfig from '../config/valkey.config';
import { SqliteReadonlyFilter } from '../exceptions/sqlite-readonly.filter';
import { ValkeyUnavailableFilter } from '../exceptions/valkey-unavailable.filter';
import { MetricsModule } from '../metrics/metrics.module';
import { unreachableValkeyUrl } from '../valkey/unreachable-valkey.test-fixture';
import { VALKEY_UNAVAILABLE_MESSAGE } from '../valkey/valkey-unavailable';
import { ValkeyModule } from '../valkey/valkey.module';
import { UsersAndAuthModule } from './users-and-auth.module';

process.env.AUTH_SESSION_SECRET ??= 'boot-spec-session-secret-0123456789abcdef';

const PASSWORD = 'valkey-boot-spec-password';

// ATT-1244: with VALKEY_URL set and Valkey down, a real ioredis client fails every command with
// MaxRetriesPerRequestError. The API must still start and answer 503 where it needs Valkey.
describe('UsersAndAuthModule with Valkey configured but unreachable', () => {
  const previousValkeyUrl = process.env.VALKEY_URL;
  let app: INestApplication;
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;

  beforeAll(async () => {
    process.env.VALKEY_URL = await unreachableValkeyUrl(PASSWORD);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    // The shared client's per-retry error line belongs to ATT-1242.
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [appConfiguration, storageConfigObject, sessionConfig, valkeyConfig],
          isGlobal: true,
        }),
        EventEmitterModule.forRoot(),
        TypeOrmModule.forRoot({
          type: 'sqlite',
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
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalFilters(new ValkeyUnavailableFilter(new SqliteReadonlyFilter(app.get(HttpAdapterHost))));
  });

  afterAll(async () => {
    await app?.close();
    if (previousValkeyUrl === undefined) delete process.env.VALKEY_URL;
    else process.env.VALKEY_URL = previousValkeyUrl;
    jest.restoreAllMocks();
  });

  it('starts, warning once that the session store (Valkey) is unreachable', async () => {
    await expect(app.init()).resolves.toBe(app);

    const warnings = warn.mock.calls.map(([message]) => String(message));
    expect(warnings.filter((message) => message.includes('Could not count active sessions'))).toEqual([
      expect.stringContaining('Valkey'),
    ]);
  });

  it('answers 503 instead of 500 when a request carries a session token', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/session/logout-capability')
      .set('Authorization', 'Bearer some-session-token');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ statusCode: 503, message: VALKEY_UNAVAILABLE_MESSAGE });
  });

  it('still answers 401 without a session token', async () => {
    const response = await request(app.getHttpServer()).get('/auth/session/logout-capability');

    expect(response.status).toBe(401);
  });

  it('never logs the Valkey password', () => {
    expect(JSON.stringify([warn.mock.calls, log.mock.calls])).not.toContain(PASSWORD);
  });
});
