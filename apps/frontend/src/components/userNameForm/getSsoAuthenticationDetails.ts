/** One of a user's sign-in methods, as far as SSO is concerned. */
export interface SsoAuthenticationDetail {
  providerId?: number | null;
  providerType?: string | null;
  ssoSubject?: string | null;
  type?: string | null;
}

/** The user's sign-in methods that come from an identity provider (SSO). */
export function getSsoAuthenticationDetails(
  user: { authenticationDetails?: unknown } | null | undefined,
): SsoAuthenticationDetail[] {
  const details = (user?.authenticationDetails ?? []) as SsoAuthenticationDetail[];
  return details.filter((detail) => detail.ssoSubject || detail.providerId || detail.providerType);
}
