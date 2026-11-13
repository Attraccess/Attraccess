import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';

import { Injectable } from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import { IdentityAuditService } from '../../../audit/identity-audit.service';

import { SessionService } from '../session.service';

import { SsoSessionRequest } from './sso-session-request';

/** The session an SSO sign-in ends in, and its audit record. */
@Injectable()
export class SsoLoginService {
  constructor(
    private readonly sessionService: SessionService,
    private readonly identityAudit: IdentityAuditService,
  ) {}

  async createSession(request: AuthenticatedRequest): Promise<string> {
    return this.sessionService.createSession(request.user, {
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip || request.connection.remoteAddress,
      ssoContext: (request as unknown as SsoSessionRequest).ssoSessionContext,
    });
  }

  async recordLogin(request: AuthenticatedRequest, providerId: number): Promise<void> {
    await this.identityAudit.record({
      action: 'sso_login',
      operationId: randomUUID(),
      outcome: 'succeeded',
      actorId: request.user.id,
      authenticationMethod: request.user.authenticationMethod ?? 'session',
      apiTokenId: request.user.apiTokenId,
      subjectId: request.user.id,
      details: { providerId },
      request: {
        ipAddress: request.ip || request.connection.remoteAddress,
        userAgent: request.headers['user-agent'],
      },
    });
  }
}
