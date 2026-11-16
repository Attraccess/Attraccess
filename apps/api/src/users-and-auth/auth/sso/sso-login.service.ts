import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';

import { Injectable } from '@nestjs/common';

import { auditActorOf } from '../../../audit/recorder/audit-event';

import { SessionService } from '../session.service';

import { SsoSessionRequest } from './sso-session-request';

/** The session an SSO sign-in ends in; the session service audits it. */
@Injectable()
export class SsoLoginService {
  constructor(private readonly sessionService: SessionService) {}

  async createSession(request: AuthenticatedRequest, providerId?: number): Promise<string> {
    const metadata = {
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip || request.connection.remoteAddress,
      ssoContext: (request as unknown as SsoSessionRequest).ssoSessionContext,
    };
    const origin = {
      actor: auditActorOf(request.user),
      request: { ipAddress: metadata.ipAddress, userAgent: metadata.userAgent },
    };
    return this.sessionService.createSsoSession(request.user, metadata, origin, providerId);
  }
}
