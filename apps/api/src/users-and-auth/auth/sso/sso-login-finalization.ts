import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { CreateSessionResponse } from '../auth.types';
import { SsoProvisioningRoutesImplementation } from './sso-provisioning.routes';
export abstract class SsoLoginFinalizationImplementation extends SsoProvisioningRoutesImplementation {
  protected async finalizeLogin(
    request: AuthenticatedRequest,
    response: Response,
    redirectTo?: string,
    providerId?: number,
  ): Promise<CreateSessionResponse | void> {
    const sessionToken = await this.sessionService.createSession(request.user, {
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip || request.connection.remoteAddress,
    });

    await this.cookieConfigService.setAuthCookie(response, sessionToken);
    if (providerId) {
      await this.identityAudit?.record({
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

    const auth: CreateSessionResponse = {
      user: request.user,
      authToken: sessionToken,
    };

    if (redirectTo) {
      const redirectUrl = new URL(redirectTo);
      redirectUrl.searchParams.delete('accountLinking');
      redirectUrl.searchParams.delete('email');
      redirectUrl.searchParams.delete('ssoLinkToken');

      this.logger.debug('Redirecting to', redirectUrl.toString());
      return response.redirect(redirectUrl.toString());
    }

    return auth;
  }
}
