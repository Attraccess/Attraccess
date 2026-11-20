/** Internal authentication provenance. Never expose this through session response DTOs. */
export type SsoSessionContext =
  | {
      /** Verified ID token iat in milliseconds, on the provider clock. */
      providerIssuedAt?: number;
      /** Last SSO permission sync (login or re-sync) in milliseconds, on the local clock. */
      lastSsoSyncAt?: number;
      /** After a failed re-sync, the next attempt waits until this time in milliseconds. */
      ssoSyncRetryAt?: number;
      protocol: 'OIDC';
      providerId: number;
      issuer: string;
      subject: string;
      sid?: string;
      idTokenEncrypted?: string;
      /** Encrypted IdP refresh token used for session-time permission re-sync. */
      refreshTokenEncrypted?: string;
    }
  | {
      /** Signed login assertion IssueInstant in milliseconds, on the provider clock. */
      providerIssuedAt?: number;
      /** Last SSO permission sync (login or re-sync) in milliseconds, on the local clock. */
      lastSsoSyncAt?: number;
      /** After a failed re-sync, the next attempt waits until this time in milliseconds. */
      ssoSyncRetryAt?: number;
      protocol: 'SAML';
      providerId: number;
      issuer?: string;
      nameID: string;
      nameIDFormat?: string;
      nameQualifier?: string;
      spNameQualifier?: string;
      sessionIndexes: string[];
    };
