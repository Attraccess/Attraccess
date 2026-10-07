import { SSOProviderOIDCConfiguration } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-openidconnect';

/** Request key set by SSOOIDCGuard so the strategy uses the per-request callback URL (current settings, no restart needed). */
export const SSO_OIDC_CALLBACK_URL_REQUEST_KEY = '_ssoOidcCallbackUrl';

/** Request key set by SSOOIDCGuard for login route: state to pass to OIDC (e.g. { redirectTo }). */
export const SSO_OIDC_STATE_REQUEST_KEY = '_ssoOidcState';

export abstract class SSOOIDCStrategyRouteContext extends PassportStrategy(Strategy, 'sso-oidc', true) {
  protected abstract readonly logger: Logger;
  protected abstract readonly config: SSOProviderOIDCConfiguration;
  protected abstract getPermissionClaimValues(claimSources: unknown[]): unknown[];
  protected abstract resolveRoleNamesFromClaims(claimValues: unknown[]): string[];
  protected abstract moduleRef: ModuleRef;
  protected abstract recordProvisioningAudit(
    userId: number,
    userCreated: boolean,
    changes?: { added: string[]; removed: string[]; updated: string[] },
  ): Promise<void>;
}
