import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import { SessionService } from '../auth/session.service';
import { User } from '@attraccess/database-entities';

@Injectable()
export class SessionStrategy extends PassportStrategy(Strategy, 'session') {
  private readonly logger = new Logger(SessionStrategy.name);

  constructor(private readonly sessionService: SessionService) {
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

    this.logger.debug(`Session validated for user: ${user.username} (ID: ${user.id})`);
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
        this.logger.debug('Token extracted from Authorization header');
        return token;
      }
    }

    // Priority 2: Session cookie
    const sessionCookie = req.cookies?.['auth-session'];
    if (sessionCookie) {
      this.logger.debug('Token extracted from session cookie');
      return sessionCookie;
    }

    this.logger.debug('No token found in request', { headers: req.headers, cookies: req.cookies });

    return null;
  }
}
