import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import { SessionService } from '../auth/session.service';
import { TwoFactorService } from '../auth/two-factor.service';
import { RbacService } from '../rbac/rbac.service';
import { User } from '@attraccess/database-entities';

const TWO_FACTOR_SETUP_ALLOWED_PREFIXES = ['/auth/two-factor', '/auth/session', '/users/me'];

@Injectable()
export class SessionStrategy extends PassportStrategy(Strategy, 'session') {
  private readonly logger = new Logger(SessionStrategy.name);

  constructor(
    private readonly sessionService: SessionService,
    private readonly twoFactorService: TwoFactorService,
    private readonly rbacService: RbacService,
  ) {
    super();
  }

  async validate(req: Request): Promise<User> {
    const token = this.extractTokenFromRequest(req);

    if (!token) {
      this.logger.debug('No session token found in request');
      throw new UnauthorizedException('No session token provided');
    }

    const user = await this.sessionService.validateSession(token);

    if (!user) {
      this.logger.debug(`Invalid or expired session token: ${token.substring(0, 8)}...`);
      throw new UnauthorizedException('Invalid or expired session');
    }

    // Attach effectivePermissions before 2FA check so isPrivilegedUser() can use them
    (user as any).effectivePermissions = await this.rbacService.getEffectivePermissions(user.id);

    if (!this.isTwoFactorSetupAllowedPath(req)) {
      const status = await this.twoFactorService.getStatus(user);
      if (status.required && !status.enabled) {
        this.logger.debug(`Blocked request for user ${user.id} due to missing 2FA setup`);
        throw new ForbiddenException('TwoFactorSetupRequired');
      }
    }

    return user;
  }

  /**
   * Extracts session token from request
   * Priority: Authorization header > Cookie
   * @param req Express request object
   * @returns Session token or null if not found
   */
  private extractTokenFromRequest(req: Request): string | null {
    // Priority 1: Authorization header with Bearer token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token) {
        return token;
      }
    }

    // Priority 2: Session cookie
    const sessionCookie = req.cookies?.['auth-session'];
    if (sessionCookie) {
      return sessionCookie;
    }

    return null;
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
