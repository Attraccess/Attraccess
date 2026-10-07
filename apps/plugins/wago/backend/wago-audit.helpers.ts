import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
export function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

/** Call only with the Nest guard-authenticated request, never a body-supplied actor. */
export function wagoAuditPrincipal(request: Pick<AuthenticatedRequest, 'user'>): PluginAuditPrincipal {
  const user = request?.user;
  if (!positiveInteger(user?.id)) throw new UnauthorizedException();
  const authenticationMethod = user.authenticationMethod ?? 'session';
  if (!['session', 'api-token'].includes(authenticationMethod)) throw new UnauthorizedException();
  if (authenticationMethod === 'api-token' && !positiveInteger(user.apiTokenId)) throw new UnauthorizedException();
  return {
    userId: user.id,
    authenticationMethod,
    ...(authenticationMethod === 'api-token' ? { apiTokenId: user.apiTokenId } : {}),
  };
}
