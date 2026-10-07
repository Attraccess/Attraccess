/** Request key where redirectTo from OIDC state is attached after callback verification. */
export const SSO_OIDC_REDIRECT_FROM_STATE_REQUEST_KEY = '_ssoOidcRedirectFromState';

/** Type for app state stored in OIDC state parameter. */
export interface OIDCAppState {
  redirectTo?: string;
}

/**
 * Resolves redirectTo from OIDC state (preferred) or query fallback.
 * Centralizes the logic used by oidcLoginCallback and AccountLinkingExceptionFilter.
 * Returns only valid non-empty strings to prevent malformed values from entering the redirect flow.
 */
export function getRedirectToFromRequest(
  request: Record<string, unknown>,
  redirectToQuery?: string,
): string | undefined {
  const fromState = request[SSO_OIDC_REDIRECT_FROM_STATE_REQUEST_KEY];
  const candidate = (typeof fromState === 'string' ? fromState : undefined) ?? redirectToQuery;
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : undefined;
}
