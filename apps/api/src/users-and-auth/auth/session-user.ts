import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { UserDto, toUserDto } from '../users/dtos/user.dto';

/**
 * The user of a session response (password, passkey and SSO login, refresh): the public profile, plus what the
 * session principal carries (permissions and how it authenticated) when the request already went through the session
 * strategy. Never the email, tokens or lockout state, whatever object the authentication layer handed over.
 */
export function toSessionUser(user: AuthenticatedRequest['user']): UserDto {
  const principal = user as Partial<AuthenticatedRequest['user']>;
  return {
    ...toUserDto(user),
    ...(principal.effectivePermissions ? { effectivePermissions: [...principal.effectivePermissions] } : {}),
    ...(principal.authenticationMethod ? { authenticationMethod: principal.authenticationMethod } : {}),
    ...(principal.apiTokenId ? { apiTokenId: principal.apiTokenId } : {}),
  };
}
