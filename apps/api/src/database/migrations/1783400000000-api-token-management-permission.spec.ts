import { QueryRunner } from 'typeorm';
import { ApiTokenManagementPermission1783400000000 } from './1783400000000-api-token-management-permission';

describe('ApiTokenManagementPermission migration', () => {
  const query = jest.fn();
  const queryRunner = { query } as unknown as QueryRunner;
  const migration = new ApiTokenManagementPermission1783400000000();

  beforeEach(() => {
    query.mockReset();
  });

  it('seeds API token management for administrators only', async () => {
    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE INTO "permission"'), [
      'users.api-tokens.manage',
      'Manage API Tokens',
      expect.any(String),
      'users',
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining(`WHERE "key" = 'administrator'`), [
      'users.api-tokens.manage',
    ]);
  });

  it('removes the permission assignment before removing the permission', async () => {
    await migration.down(queryRunner);

    expect(query.mock.calls).toEqual([
      [expect.stringContaining('DELETE FROM "role_permission"'), ['users.api-tokens.manage']],
      [expect.stringContaining('DELETE FROM "permission"'), ['users.api-tokens.manage']],
    ]);
  });
});
