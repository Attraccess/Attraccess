import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DualAuthGuard } from '@attraccess/plugins-backend-sdk/v2';
import { TokenHashService } from '../../../encryption/token-hash.service';
import { SessionStrategy } from '../../strategies/session.strategy';
import { ApiTokenController } from './api-token.controller';
import { TypeormApiTokenPersistence } from '../persistence/typeorm-adapter';
import { DataSource, EntitySchema } from 'typeorm';
import { ApiToken, ApiTokenPermission } from '@attraccess/database-entities';
import { ApiTokenService } from './api-token.service';

// Use a real SQLite repository: TypeORM ignores plain null values in WHERE
// clauses, which repository mocks cannot detect.
const tokenSchema = new EntitySchema<ApiToken>({
  name: 'ApiToken',
  target: ApiToken,
  columns: {
    id: { type: Number, primary: true, generated: true },
    userId: { type: Number },
    name: { type: String },
    tokenHash: { type: String, nullable: true },
    expiresAt: { type: Date, nullable: true },
    lastUsedAt: { type: Date, nullable: true },
    revokedAt: { type: Date, nullable: true },
    createdAt: { type: Date, createDate: true },
  },
  relations: {
    apiTokenPermissions: { type: 'one-to-many', target: 'ApiTokenPermission', inverseSide: 'apiToken' },
  },
});
const permissionSchema = new EntitySchema<ApiTokenPermission>({
  name: 'ApiTokenPermission',
  target: ApiTokenPermission,
  columns: {
    id: { type: Number, primary: true, generated: true },
    apiTokenId: { type: Number },
    permissionKey: { type: String },
  },
  relations: {
    apiToken: { type: 'many-to-one', target: 'ApiToken', joinColumn: { name: 'apiTokenId' } },
  },
});

describe('API token revocation with SQLite', () => {
  let database: DataSource;
  let service: ApiTokenService;

  beforeEach(async () => {
    database = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [tokenSchema, permissionSchema],
      synchronize: true,
    }).initialize();
    service = new ApiTokenService(
      new TypeormApiTokenPersistence(database.getRepository(ApiToken), {} as never),
      {} as never,
      {} as never,
    );
    await database.getRepository(ApiToken).save([
      { id: 1, userId: 1, name: 'Active', revokedAt: null },
      { id: 2, userId: 1, name: 'Revoked', revokedAt: new Date() },
      { id: 3, userId: 2, name: 'Another owner', revokedAt: null },
    ]);
  });

  afterEach(async () => {
    if (database?.isInitialized) await database.destroy();
  });

  it('authenticates hydrated SQLite tokens and preserves permissions in HTTP create/list/update responses', async () => {
    await database.query('CREATE TABLE fixture_owner (id INTEGER PRIMARY KEY, username TEXT, isDisabled BOOLEAN)');
    await database.query("INSERT INTO fixture_owner VALUES (1, 'operator', 0)");
    const permissions = new Set(['users.api-tokens.manage', 'resources.read', 'resources.manage']);
    const rbac = { getEffectivePermissions: jest.fn().mockResolvedValue(permissions) };
    const persistence = new TypeormApiTokenPersistence(database.getRepository(ApiToken), {
      findOneBy: async ({ id }) => (await database.query('SELECT * FROM fixture_owner WHERE id = ?', [id]))[0] ?? null,
    } as never);
    const hash = new TokenHashService({ get: () => ({ AUTH_SESSION_SECRET: 'test-only-api-token-secret' }) } as never);
    const apiTokens = new ApiTokenService(persistence, hash, rbac as never);
    const module = await Test.createTestingModule({
      controllers: [ApiTokenController],
      providers: [{ provide: ApiTokenService, useValue: apiTokens }],
    })
      .overrideGuard(DualAuthGuard)
      .useValue({
        canActivate: (context) => {
          context.switchToHttp().getRequest().user = {
            id: 1,
            authenticationMethod: 'session',
            effectivePermissions: permissions,
          };
          return true;
        },
      })
      .compile();
    const app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
    try {
      const created = await request(app.getHttpServer())
        .post('/users/me/api-tokens')
        .send({ name: 'Automation', permissionKeys: ['resources.read'] })
        .expect(201);
      expect(created.body.permissionKeys).toEqual(['resources.read']);
      expect(created.body).not.toHaveProperty('tokenHash');
      const strategy = new SessionStrategy({} as never, {} as never, rbac as never, apiTokens, {
        log: jest.fn(),
      } as never);
      const principal = await strategy.validate({
        headers: { authorization: `Bearer ${created.body.token}` },
        ip: '127.0.0.1',
      } as never);
      expect([...Reflect.get(principal, 'effectivePermissions')]).toEqual(['resources.read']);
      expect(Reflect.get(principal, 'authenticationMethod')).toBe('api-token');
      const listed = await request(app.getHttpServer()).get('/users/me/api-tokens').expect(200);
      expect(listed.body.data.find(({ id }) => id === created.body.id).permissionKeys).toEqual(['resources.read']);
      const renamed = await request(app.getHttpServer())
        .patch(`/users/me/api-tokens/${created.body.id}`)
        .send({ name: 'Renamed' })
        .expect(200);
      expect(renamed.body.permissionKeys).toEqual(['resources.read']);
      const updated = await request(app.getHttpServer())
        .patch(`/users/me/api-tokens/${created.body.id}`)
        .send({ permissionKeys: ['resources.manage'] })
        .expect(200);
      expect(updated.body.permissionKeys).toEqual(['resources.manage']);
      expect((await apiTokens.authenticate(created.body.token))?.apiToken.permissionKeys).toEqual(['resources.manage']);
    } finally {
      await app.close();
    }
  });

  it('projects permission keys from hydrated rows for create, authenticate, list and update', async () => {
    const persistence = new TypeormApiTokenPersistence(database.getRepository(ApiToken), {} as never);
    const created = await persistence.createToken(
      { userId: 1, name: 'Automation', tokenHash: 'stored-hash', expiresAt: null },
      ['resources.read'],
    );
    const assertToken = (token: ApiToken | null | undefined, permissions: string[]) => {
      expect(Object.getPrototypeOf(token)).toBe(Object.prototype);
      expect(token?.permissionKeys.filter((key) => key.startsWith('resources.'))).toEqual(permissions);
    };
    assertToken(created, ['resources.read']);
    assertToken(await persistence.findByHash('stored-hash'), ['resources.read']);
    assertToken(await persistence.findOwned(1, created.id), ['resources.read']);
    assertToken((await persistence.activePage(1, 1, 10))[0].find(({ id }) => id === created.id) ?? null, [
      'resources.read',
    ]);
    const updated = await persistence.updateToken(created, ['resources.manage']);
    assertToken(updated, ['resources.manage']);
    assertToken(await persistence.findByHash('stored-hash'), ['resources.manage']);
  });

  it('lists only active tokens belonging to the current owner and removes them after revocation', async () => {
    const before = await service.list(1, 1, 10);
    expect(before.total).toBe(1);
    expect(before.data.map((token) => token.id)).toEqual([1]);

    await service.revoke(1, 1);

    expect(await service.list(1, 1, 10)).toMatchObject({ data: [], total: 0 });
    expect((await database.getRepository(ApiToken).findOneByOrFail({ id: 1 })).revokedAt).toBeInstanceOf(Date);
    expect((await service.list(2, 1, 10)).data.map((token) => token.id)).toEqual([3]);
  });

  it("prevents modifying or revoking an already revoked token or another owner's token", async () => {
    await expect(service.update(1, 2, { name: 'Changed' })).rejects.toThrow('ApiTokenNotFound');
    await expect(service.revoke(1, 2)).rejects.toThrow('ApiTokenNotFound');
    await expect(service.revoke(1, 3)).rejects.toThrow('ApiTokenNotFound');
    expect((await database.getRepository(ApiToken).findOneByOrFail({ id: 2 })).name).toBe('Revoked');
  });
});
