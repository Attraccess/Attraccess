import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import { LogoutSession } from '../auth/session-store/session-store';
import { SessionService } from '../auth/session.service';
import { TwoFactorService } from '../auth/two-factor.service';
import { RbacService } from '../rbac/rbac.service';
import { ApiTokenService } from '../auth/api-token/api-token.service';
import { AuthAuditLogger } from '../rate-limiting/auth-audit.logger';
import { SessionPermissionSync } from '../auth/sso/session-permission-sync';
import { resolveIp } from '../rate-limiting/login.rate-limit.guard';
import { User } from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { databaseBusyException, isSqliteBusyError } from '../../database/sqlite-errors';
import { isValkeyUnavailableError, valkeyUnavailableException } from '../../valkey/valkey-unavailable';
import { getMcpDelegation, McpDelegation } from './mcp-delegation';

const TWO_FACTOR_SETUP_ALLOWED_PREFIXES = ['/auth/two-factor', '/auth/session', '/users/me'];

// ponytail: Set serializes as {} over JSON; this subclass emits an array so plugins/responses are safe
class SerializablePermissionSet extends Set<string> {
  toJSON() {
    return [...this];
  }
}

@Injectable()
export class SessionStrategy extends PassportStrategy(Strategy, 'session') {
  private readonly logger = new Logger(SessionStrategy.name);

  constructor(
    private readonly sessionService: SessionService,
    private readonly twoFactorService: TwoFactorService,
    private readonly rbacService: RbacService,
    private readonly apiTokenService: ApiTokenService,
    private readonly authAuditLogger: AuthAuditLogger,
    private readonly ssoPermissionSync: SessionPermissionSync,
  ) {
    super();
  }

  async validate(req: Request & { authSession?: LogoutSession }): Promise<User> {
    try {
      return await this.resolveUser(req);
    } catch (error) {
      // An unreachable Valkey is not a failed sign-in: answer 503 (the auth guard passes 5xx through) instead of 401.
      if (isValkeyUnavailableError(error)) throw valkeyUnavailableException(error as Error);
      // Neither is a busy database (a request that waited too long for another request's transaction): answering 401
      // would make clients drop a valid session.
      if (isSqliteBusyError(error)) throw databaseBusyException();
      throw error;
    }
  }

  private async resolveUser(req: Request & { authSession?: LogoutSession }): Promise<User> {
    // An MCP OAuth tool call: the principal was attached in-process after the access token was verified.
    const delegation = getMcpDelegation(req);
    if (delegation) return this.validateMcpDelegation(req, delegation);

    const { token, fromAuthorizationHeader } = this.extractTokenFromRequest(req);

    if (!token) {
      this.logger.debug('No session token found in request');
      throw new UnauthorizedException('No session token provided');
    }

    if (fromAuthorizationHeader) {
      const tokenPrincipal = await this.apiTokenService.authenticate(token);
      if (tokenPrincipal) {
        const authenticatedUser = tokenPrincipal.user as AuthenticatedUser;
        // Tokens must reflect owner permission removals immediately, including after a role change on another replica.
        const ownerPermissions = await this.rbacService.getEffectivePermissions(tokenPrincipal.user.id, true);
        if (!ownerPermissions.has('users.api-tokens.manage')) {
          throw new UnauthorizedException('API token permission revoked');
        }
        authenticatedUser.effectivePermissions = new SerializablePermissionSet(
          tokenPrincipal.apiToken.permissionKeys.filter((permission) => ownerPermissions.has(permission)),
        );
        authenticatedUser.authenticationMethod = 'api-token';
        authenticatedUser.apiTokenId = tokenPrincipal.apiToken.id;
        this.authAuditLogger.log({
          type: 'api_token',
          outcome: 'success',
          ip: resolveIp(req),
          userId: authenticatedUser.id,
          username: authenticatedUser.username,
          authenticationMethod: 'api-token',
          apiTokenId: tokenPrincipal.apiToken.id,
        });
        return tokenPrincipal.user;
      }
    }

    const authenticated = await this.sessionService.authenticateSession(token);

    if (!authenticated) {
      this.logger.debug(`Invalid or expired session token: ${token.substring(0, 8)}...`);
      throw new UnauthorizedException('Invalid or expired session');
    }

    const { user, session } = authenticated;
    req.authSession = session;

    // Re-evaluate SSO roles before computing permissions once the provider's re-sync interval elapsed.
    if ((await this.ssoPermissionSync.syncIfDue(session, user.id)) === 'revoked') {
      throw new UnauthorizedException('Session was ended by the identity provider');
    }

    // Attach effectivePermissions before 2FA check so isPrivilegedUser() can use them
    (user as AuthenticatedUser).effectivePermissions = new SerializablePermissionSet(
      await this.rbacService.getEffectivePermissions(user.id),
    );
    (user as AuthenticatedUser).authenticationMethod = 'session';

    await this.assertTwoFactorSetup(req, user);

    return user;
  }

  /**
   * MCP OAuth principal: the permissions the user approved, intersected with what they hold right now, so a role
   * removed in Attraccess disappears from MCP on the next call. No session exists for it.
   */
  private async validateMcpDelegation(req: Request, delegation: McpDelegation): Promise<User> {
    const { user } = delegation;
    const current = await this.rbacService.getEffectivePermissions(user.id, true);
    (user as AuthenticatedUser).effectivePermissions = new SerializablePermissionSet(
      delegation.permissionKeys.filter((permission) => current.has(permission)),
    );
    (user as AuthenticatedUser).authenticationMethod = 'mcp-oauth';
    await this.assertTwoFactorSetup(req, user);
    return user;
  }

  private async assertTwoFactorSetup(req: Request, user: User): Promise<void> {
    if (this.isTwoFactorSetupAllowedPath(req)) return;
    const status = await this.twoFactorService.getStatus(user);
    if (status.required && !status.enabled) {
      this.logger.debug(`Blocked request for user ${user.id} due to missing 2FA setup`);
      throw new ForbiddenException('TwoFactorSetupRequired');
    }
  }

  /**
   * Extracts session token from request
   * Priority: Authorization header > Cookie
   * @param req Express request object
   * @returns Session token or null if not found
   */
  private extractTokenFromRequest(req: Request): { token: string | null; fromAuthorizationHeader: boolean } {
    // Priority 1: Authorization header with Bearer token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token) {
        return { token, fromAuthorizationHeader: true };
      }
    }

    // Priority 2: Session cookie
    const sessionCookie = req.cookies?.['auth-session'];
    if (sessionCookie) {
      return { token: sessionCookie, fromAuthorizationHeader: false };
    }

    return { token: null, fromAuthorizationHeader: false };
  }

  private isTwoFactorSetupAllowedPath(req: Request): boolean {
    const rawPath = req.path || req.originalUrl || '';
    const normalizedPath = this.normalizePath(rawPath);

    if (!normalizedPath) {
      return false;
    }

    return TWO_FACTOR_SETUP_ALLOWED_PREFIXES.some(
      (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
    );
  }

  private normalizePath(rawPath: string): string {
    if (!rawPath) {
      return '';
    }

    const withoutQuery = rawPath.split('?')[0] ?? '';
    const withoutPrefix = withoutQuery.startsWith('/api/') ? withoutQuery.slice(4) : withoutQuery;
    const trimmed = withoutPrefix.replace(/\/+$/, '');

    return trimmed || '/';
  }
}
