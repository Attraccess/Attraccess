import { DataSource } from 'typeorm';
import { ApiToken, Permission, User } from '@attraccess/database-entities';
import { unitOfWorkFor } from '../../../database/adapters/shared-unit-of-work';
import { SqliteFileFixture } from '../../../database/adapters/sqlite-file.test-fixture';
import { TypeOrmApiTokenStore } from '../../../database/adapters/auth/typeorm-api-token.store';
import { ApiTokenService } from './api-token.service';

jest.setTimeout(60_000);

// A real SQLite store: TypeORM ignores plain null values in WHERE clauses, which fakes cannot detect.
describe('API token revocation with SQLite', () => {
  let fixture: SqliteFileFixture;
  let database: DataSource;
  let service: ApiTokenService;

  beforeAll(async () => {
    fixture = await SqliteFileFixture.create();
    database = await fixture.open();
  });

  afterAll(async () => {
    await fixture.close();
  });

  beforeEach(async () => {
    await database.getRepository(ApiToken).clear();
    await database.getRepository(User).clear();
    await database.getRepository(User).save([
      { id: 1, username: 'one', email: 'one@example.com' },
      { id: 2, username: 'two', email: 'two@example.com' },
    ]);
    await database
      .getRepository(Permission)
      .save([{ key: 'resources.read', label: 'Read', description: 'Read', category: 'resources' }]);
    service = new ApiTokenService(
      new TypeOrmApiTokenStore(database.getRepository(ApiToken), unitOfWorkFor(database)),
      { findSessionUser: jest.fn() },
      { hashApiToken: (token: string) => `h:${token}` } as never,
      { getEffectivePermissions: jest.fn().mockResolvedValue(new Set(['resources.read'])) } as never,
    );
    await database.getRepository(ApiToken).save([
      { id: 1, userId: 1, name: 'Active', tokenHash: 'a', revokedAt: null },
      { id: 2, userId: 1, name: 'Revoked', tokenHash: 'b', revokedAt: new Date() },
      { id: 3, userId: 2, name: 'Another owner', tokenHash: 'c', revokedAt: null },
    ]);
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

  it('issues a token whose secret authenticates once and never appears in the stored row or the listing', async () => {
    const { apiToken, token } = await service.create(1, { name: 'New', permissionKeys: ['resources.read'] });

    const stored = await database.getRepository(ApiToken).findOneByOrFail({ id: apiToken.id });
    expect(stored.tokenHash).toBe(`h:${token}`);
    expect(JSON.stringify(await service.list(1, 1, 10))).not.toContain(token);
    expect(JSON.stringify(await service.list(1, 1, 10))).not.toContain(stored.tokenHash);
  });
});
