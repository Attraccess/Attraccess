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
    service = new ApiTokenService(database.getRepository(ApiToken), {} as never, {} as never, {} as never);
    await database.getRepository(ApiToken).save([
      { id: 1, userId: 1, name: 'Active', revokedAt: null },
      { id: 2, userId: 1, name: 'Revoked', revokedAt: new Date() },
      { id: 3, userId: 2, name: 'Another owner', revokedAt: null },
    ]);
  });

  afterEach(async () => {
    if (database?.isInitialized) await database.destroy();
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
