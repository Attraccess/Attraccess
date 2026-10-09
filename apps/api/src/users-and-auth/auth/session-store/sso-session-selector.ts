import { SsoSessionContext } from '@attraccess/database-entities';

export type SsoSessionSelector =
  | { protocol: 'OIDC'; providerId: number; issuer: string; subject?: string; sid?: string; issuedBefore?: number }
  | {
      protocol: 'SAML';
      providerId: number;
      issuer?: string;
      nameID: string;
      nameIDFormat?: string;
      nameQualifier?: string;
      spNameQualifier?: string;
      sessionIndexes?: string[];
      issuedBefore?: number;
    };

export function matchesSsoSession(
  context: SsoSessionContext | null | undefined,
  selector: SsoSessionSelector,
): boolean {
  if (!context || context.providerId !== selector.providerId || context.protocol !== selector.protocol) return false;
  // Login and logout timestamps must come from the same provider clock.
  // Older sessions have no provider timestamp and remain eligible for logout.
  if (
    selector.issuedBefore !== undefined &&
    context.providerIssuedAt !== undefined &&
    context.providerIssuedAt > selector.issuedBefore
  )
    return false;
  if (context.protocol === 'OIDC' && selector.protocol === 'OIDC') {
    return (
      context.issuer === selector.issuer &&
      !!(selector.subject || selector.sid) &&
      (!selector.subject || context.subject === selector.subject) &&
      (!selector.sid || context.sid === selector.sid)
    );
  }
  if (context.protocol === 'SAML' && selector.protocol === 'SAML') {
    return (
      (!selector.issuer || context.issuer === selector.issuer) &&
      context.nameID === selector.nameID &&
      (context.nameIDFormat ?? '') === (selector.nameIDFormat ?? '') &&
      (context.nameQualifier ?? '') === (selector.nameQualifier ?? '') &&
      (context.spNameQualifier ?? '') === (selector.spNameQualifier ?? '') &&
      (!selector.sessionIndexes?.length ||
        selector.sessionIndexes.some((index) => context.sessionIndexes.includes(index)))
    );
  }
  return false;
}
