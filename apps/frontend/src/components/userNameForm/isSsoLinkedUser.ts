/** Whether the user signs in through an identity provider, which then manages the name. */
export function isSsoLinkedUser(user: { authenticationDetails?: unknown } | undefined): boolean {
  const details = (user?.authenticationDetails ?? []) as {
    providerId?: number | null;
    providerType?: string | null;
    ssoSubject?: string | null;
  }[];
  return details.some((detail) => detail.ssoSubject || detail.providerId || detail.providerType);
}
