import type { DataSource } from 'typeorm';
import { McpOAuthClient, McpOAuthGrant, McpOAuthToken, User } from '@attraccess/database-entities';
import { ensureEntity } from '../seed-storage.test-fixture';

export async function migrationMcpOAuthSeeds(dataSource: DataSource, seedTag: string, user: User) {
  const client = await ensureEntity(dataSource.getRepository(McpOAuthClient), () => ({
    clientId: `seed-client-${seedTag}`,
    clientName: 'Seed client',
    redirectUris: ['http://127.0.0.1:8123/callback'],
    registeredIp: null,
  }));
  const grant = await ensureEntity(dataSource.getRepository(McpOAuthGrant), () => ({
    id: `seed-grant-${seedTag}`,
    userId: user.id,
    clientId: client.clientId,
    permissionKeys: ['resources.read'],
    resource: 'http://localhost:3000/api/mcp',
    expiresAt: new Date(Date.now() + 86_400_000),
    lastUsedAt: null,
    revokedAt: null,
  }));
  await ensureEntity(dataSource.getRepository(McpOAuthToken), () => ({
    tokenHash: `seed-token-hash-${seedTag}`,
    kind: 'access' as const,
    grantId: grant.id,
    payload: null,
    expiresAt: new Date(Date.now() + 900_000),
    usedAt: null,
  }));
}
