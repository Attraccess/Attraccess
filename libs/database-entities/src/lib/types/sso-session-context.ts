/** Internal authentication provenance. Never expose this through session response DTOs. */
export type SsoSessionContext =
  | { protocol: 'OIDC'; providerId: number; issuer: string; subject: string; sid?: string; idTokenEncrypted?: string }
  | {
      protocol: 'SAML';
      providerId: number;
      issuer?: string;
      nameID: string;
      nameIDFormat?: string;
      nameQualifier?: string;
      spNameQualifier?: string;
      sessionIndexes: string[];
    };
