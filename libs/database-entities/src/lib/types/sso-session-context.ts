/** Internal authentication provenance. Never expose this through session response DTOs. */
export type SsoSessionContext =
  | {
      /** Verified ID token iat in milliseconds, on the provider clock. */
      providerIssuedAt?: number;
      protocol: 'OIDC';
      providerId: number;
      issuer: string;
      subject: string;
      sid?: string;
      idTokenEncrypted?: string;
    }
  | {
      /** Signed login assertion IssueInstant in milliseconds, on the provider clock. */
      providerIssuedAt?: number;
      protocol: 'SAML';
      providerId: number;
      issuer?: string;
      nameID: string;
      nameIDFormat?: string;
      nameQualifier?: string;
      spNameQualifier?: string;
      sessionIndexes: string[];
    };
