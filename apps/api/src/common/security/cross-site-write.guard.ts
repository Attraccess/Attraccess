import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AUTH_COOKIE_NAME } from '../services/cookie-config.service';
import { ApprovedOriginsService } from './approved-origins.service';

const ALLOW_CROSS_SITE_WRITE = 'allowCrossSiteWrite';

/**
 * Marks a route that is called by another website or server on purpose and
 * authenticates the caller itself (signed assertion, shared secret, provider token).
 */
export const AllowCrossSiteWrite = () => SetMetadata(ALLOW_CROSS_SITE_WRITE, true);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Refuses data-changing requests that a browser sends on behalf of a website
 * Attraccess does not trust. Bearer tokens and API keys are not ambient
 * credentials and are not affected.
 */
@Injectable()
export class CrossSiteWriteGuard implements CanActivate {
  private readonly logger = new Logger(CrossSiteWriteGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly approvedOrigins: ApprovedOriginsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_CROSS_SITE_WRITE, [context.getHandler(), context.getClass()]))
      return true;
    if (request.headers.authorization || request.headers['x-api-key']) return true;

    const origin = request.headers.origin;
    if (origin !== undefined) {
      if (await this.approvedOrigins.isApproved(origin, request)) return true;
      return this.deny(request, 'origin_not_approved');
    }
    if (request.headers['sec-fetch-site'] === 'cross-site') return this.deny(request, 'cross_site_request');
    if (request.cookies?.[AUTH_COOKIE_NAME]) return this.deny(request, 'cookie_without_origin');
    return true;
  }

  private deny(request: Request, reason: string): never {
    // Never log cookie or token values.
    this.logger.warn(
      `Refused ${request.method} ${request.path}: ${reason} (origin=${request.headers.origin ?? 'none'}, ` +
        `sec-fetch-site=${request.headers['sec-fetch-site'] ?? 'none'})`,
    );
    throw new ForbiddenException('This website is not approved to make changes');
  }
}
