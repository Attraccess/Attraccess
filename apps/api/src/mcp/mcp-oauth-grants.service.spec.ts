import type { McpOAuthGrantRecord } from '@attraccess/application-models';
import { McpOAuthGrantsService } from './mcp-oauth-grants.service';
import type { McpOAuthStore } from './mcp-oauth.port';
import { McpOAuthError, McpOAuthService } from './mcp-oauth.service';

const grant = (overrides: Partial<McpOAuthGrantRecord>): McpOAuthGrantRecord => ({
  id: 'g1',
  userId: 7,
  clientId: 'client-1',
  permissionKeys: ['resources.read'],
  resource: 'https://example.test/api/mcp',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: new Date('2026-02-01T00:00:00Z'),
  lastUsedAt: null,
  revokedAt: null,
  ...overrides,
});

describe('McpOAuthGrantsService', () => {
  const grants = [
    grant({ id: 'g1' }),
    grant({ id: 'g2', clientId: 'gone' }),
    grant({ id: 'g3', clientId: 'operator' }),
  ];
  const store = {
    listActiveGrantsForUser: jest.fn(async () => grants),
    findGrant: jest.fn(async (id: string) => grants.find((entry) => entry.id === id) ?? null),
  };
  const oauth = {
    findClient: jest.fn(async (clientId: string) =>
      clientId === 'gone'
        ? null
        : {
            clientId,
            clientName: clientId === 'operator' ? 'Operator app' : 'Self-registered',
            isStatic: clientId === 'operator',
          },
    ),
    revokeGrant: jest.fn(async () => undefined),
  };
  const service = new McpOAuthGrantsService(oauth as unknown as McpOAuthService, store as unknown as McpOAuthStore);

  it('names a grant by its client, and by the client id once the client is gone', async () => {
    const list = await service.list(7);
    expect(list.map(({ id, clientName, registeredByOperator }) => ({ id, clientName, registeredByOperator }))).toEqual([
      { id: 'g1', clientName: 'Self-registered', registeredByOperator: false },
      { id: 'g2', clientName: 'gone', registeredByOperator: false },
      { id: 'g3', clientName: 'Operator app', registeredByOperator: true },
    ]);
    expect(list[0]).not.toHaveProperty('userId');
  });

  it('revokes the grant of the user', async () => {
    await service.revoke(7, 'g1');
    expect(oauth.revokeGrant).toHaveBeenCalledWith('g1');
  });

  it('reports a missing grant and the grant of another user the same way', async () => {
    oauth.revokeGrant.mockClear();
    await expect(service.revoke(8, 'g1')).rejects.toMatchObject({ code: 'not_found', status: 404 });
    await expect(service.revoke(7, 'nope')).rejects.toBeInstanceOf(McpOAuthError);
    expect(oauth.revokeGrant).not.toHaveBeenCalled();
  });
});
