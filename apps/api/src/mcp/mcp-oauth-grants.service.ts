import { Inject, Injectable } from '@nestjs/common';
import type { McpOAuthGrantDto } from './mcp-oauth.dto';
import { MCP_OAUTH_STORE, McpOAuthStore } from './mcp-oauth.port';
import { McpOAuthError, McpOAuthService } from './mcp-oauth.service';

/** What a user sees of the MCP clients they have connected, and how they end one. */
@Injectable()
export class McpOAuthGrantsService {
  constructor(
    private readonly oauth: McpOAuthService,
    @Inject(MCP_OAUTH_STORE) private readonly oauthStore: McpOAuthStore,
  ) {}

  /** The user's active grants, newest first. */
  async list(userId: number): Promise<McpOAuthGrantDto[]> {
    const grants = await this.oauthStore.listActiveGrantsForUser(userId);
    const clients = new Map<string, Awaited<ReturnType<McpOAuthService['findClient']>>>();
    for (const clientId of new Set(grants.map((grant) => grant.clientId))) {
      clients.set(clientId, await this.oauth.findClient(clientId));
    }
    return grants.map((grant) => {
      const client = clients.get(grant.clientId);
      return {
        id: grant.id,
        clientName: client?.clientName ?? grant.clientId,
        registeredByOperator: client?.isStatic ?? false,
        permissionKeys: grant.permissionKeys,
        createdAt: grant.createdAt,
        lastUsedAt: grant.lastUsedAt,
        expiresAt: grant.expiresAt,
      };
    });
  }

  /**
   * Ends the user's grant together with its tokens. A grant of another user, or one that already ended, is reported as
   * missing, like on the list; the original revocation time is kept.
   */
  async revoke(userId: number, grantId: string): Promise<void> {
    const grant = await this.oauthStore.findGrant(grantId);
    const active = grant && grant.userId === userId && !grant.revokedAt && grant.expiresAt.getTime() > Date.now();
    if (!active) throw new McpOAuthError('not_found', 'Unknown grant', 404);
    await this.oauth.revokeGrant(grant.id);
  }
}
