import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  McpOAuthClientRecord,
  McpOAuthGrantRecord,
  McpOAuthTokenKind,
  McpOAuthTokenRecord,
  NewMcpOAuthClient,
  NewMcpOAuthGrant,
  NewMcpOAuthToken,
} from '@attraccess/application-models';
import { McpOAuthClient, McpOAuthGrant, McpOAuthToken } from '@attraccess/database-entities';
import { EntityManager, LessThan, Repository } from 'typeorm';
import { ScopedUnitOfWork, UNIT_OF_WORK } from '../../unit-of-work';
import type { McpOAuthStore } from '../../../mcp/mcp-oauth.port';

/** Advisory lock key serialising OAuth client registrations (unique among the keys listed in `resource-locks.ts`). */
const MCP_CLIENT_REGISTRATION_LOCK = 584_601;

const toClient = (row: McpOAuthClient): McpOAuthClientRecord => ({
  clientId: row.clientId,
  clientName: row.clientName,
  redirectUris: row.redirectUris,
  registeredIp: row.registeredIp,
  createdAt: row.createdAt,
});

const toGrant = (row: McpOAuthGrant): McpOAuthGrantRecord => ({
  id: row.id,
  userId: row.userId,
  clientId: row.clientId,
  permissionKeys: row.permissionKeys,
  resource: row.resource,
  createdAt: row.createdAt,
  expiresAt: row.expiresAt,
  lastUsedAt: row.lastUsedAt,
  revokedAt: row.revokedAt,
});

const toToken = (row: McpOAuthToken): McpOAuthTokenRecord => ({
  tokenHash: row.tokenHash,
  kind: row.kind,
  grantId: row.grantId,
  payload: row.payload,
  createdAt: row.createdAt,
  expiresAt: row.expiresAt,
  usedAt: row.usedAt,
});

@Injectable()
export class TypeOrmMcpOAuthStore implements McpOAuthStore {
  constructor(
    @InjectRepository(McpOAuthClient) private readonly clients: Repository<McpOAuthClient>,
    @InjectRepository(McpOAuthGrant) private readonly grants: Repository<McpOAuthGrant>,
    @InjectRepository(McpOAuthToken) private readonly tokens: Repository<McpOAuthToken>,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: ScopedUnitOfWork<EntityManager>,
  ) {}

  async findClient(clientId: string): Promise<McpOAuthClientRecord | null> {
    const row = await this.clients.findOneBy({ clientId });
    return row ? toClient(row) : null;
  }

  async registerClient(
    client: NewMcpOAuthClient,
    limit: number,
    staleBefore: Date,
  ): Promise<McpOAuthClientRecord | null> {
    // The limit check and the insert run under one transaction-level advisory lock, so parallel registrations
    // (several API instances included) cannot all pass the check and exceed the limit.
    return this.unitOfWork.run(async (scope) => {
      const manager = this.unitOfWork.handleOf(scope);
      await manager.query('SELECT pg_advisory_xact_lock($1)', [MCP_CLIENT_REGISTRATION_LOCK]);
      const clients = manager.getRepository(McpOAuthClient);
      if ((await clients.count()) >= limit) {
        // Registrations that never obtained a grant and are old enough make room.
        await clients
          .createQueryBuilder()
          .delete()
          .where('"createdAt" < :cutoff', { cutoff: staleBefore })
          .andWhere('"clientId" NOT IN (SELECT "clientId" FROM "mcp_oauth_grant")')
          .execute();
        if ((await clients.count()) >= limit) return null;
      }
      return toClient(await clients.save(clients.create(client)));
    });
  }

  async createGrant(grant: NewMcpOAuthGrant): Promise<McpOAuthGrantRecord> {
    return toGrant(await this.grants.save(this.grants.create({ ...grant, lastUsedAt: null, revokedAt: null })));
  }

  async findGrant(grantId: string): Promise<McpOAuthGrantRecord | null> {
    const row = await this.grants.findOneBy({ id: grantId });
    return row ? toGrant(row) : null;
  }

  async touchGrant(grantId: string, usedAt: Date): Promise<void> {
    await this.grants.update({ id: grantId }, { lastUsedAt: usedAt });
  }

  revokeGrant(grantId: string, revokedAt: Date): Promise<void> {
    return this.unitOfWork.run(async (scope) => {
      const manager = this.unitOfWork.handleOf(scope);
      await manager.getRepository(McpOAuthGrant).update({ id: grantId }, { revokedAt });
      await manager.getRepository(McpOAuthToken).delete({ grantId });
    });
  }

  async insertToken(token: NewMcpOAuthToken): Promise<void> {
    await this.tokens.insert({ ...token, usedAt: null });
  }

  async findToken(tokenHash: string, kind: McpOAuthTokenKind): Promise<McpOAuthTokenRecord | null> {
    const row = await this.tokens.findOneBy({ tokenHash, kind });
    return row ? toToken(row) : null;
  }

  async consumeToken(tokenHash: string, usedAt: Date): Promise<boolean> {
    const result = await this.tokens
      .createQueryBuilder()
      .update(McpOAuthToken)
      .set({ usedAt })
      .where('"tokenHash" = :tokenHash AND "usedAt" IS NULL', { tokenHash })
      .execute();
    return result.affected === 1;
  }

  async purgeExpired(requestsBefore: Date, othersBefore: Date): Promise<void> {
    await this.tokens.delete({ kind: 'request', expiresAt: LessThan(requestsBefore) });
    await this.tokens.delete({ expiresAt: LessThan(othersBefore) });
    await this.grants.delete({ expiresAt: LessThan(othersBefore) });
  }
}
