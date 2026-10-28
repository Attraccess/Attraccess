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

type OidcContext = Extract<SsoSessionContext, { protocol: 'OIDC' }>;
type SamlContext = Extract<SsoSessionContext, { protocol: 'SAML' }>;
type OidcSelector = Extract<SsoSessionSelector, { protocol: 'OIDC' }>;
type SamlSelector = Extract<SsoSessionSelector, { protocol: 'SAML' }>;

// Login and logout timestamps must come from the same provider clock.
// Older sessions have no provider timestamp and remain eligible for logout.
function issuedAfterSelector(context: SsoSessionContext, selector: SsoSessionSelector): boolean {
  return (
    selector.issuedBefore !== undefined &&
    context.providerIssuedAt !== undefined &&
    context.providerIssuedAt > selector.issuedBefore
  );
}

function matchesOidcSession(context: OidcContext, selector: OidcSelector): boolean {
  return (
    context.issuer === selector.issuer &&
    !!(selector.subject || selector.sid) &&
    (!selector.subject || context.subject === selector.subject) &&
    (!selector.sid || context.sid === selector.sid)
  );
}

function matchesSamlSession(context: SamlContext, selector: SamlSelector): boolean {
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

export function matchesSsoSession(
  context: SsoSessionContext | null | undefined,
  selector: SsoSessionSelector,
): boolean {
  if (!context || context.providerId !== selector.providerId || context.protocol !== selector.protocol) return false;
  if (issuedAfterSelector(context, selector)) return false;
  if (context.protocol === 'OIDC' && selector.protocol === 'OIDC') return matchesOidcSession(context, selector);
  if (context.protocol === 'SAML' && selector.protocol === 'SAML') return matchesSamlSession(context, selector);
  return false;
}
