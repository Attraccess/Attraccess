import type { SSOProviderType } from './ssoProvider';

export interface SsoOidcConfigurationRecord {
  id: number;
  ssoProviderId: number;
  issuer: string;
  authorizationURL: string;
  tokenURL: string;
  userInfoURL: string;
  clientId: string;
  /** Stored encrypted; the SSO service decrypts it for in-app use. */
  clientSecret: string;
  scopes: string[] | null;
  usernameClaimPaths: string[] | null;
  emailClaimPaths: string[] | null;
  roleClaimPaths?: string[] | null;
  roleMappings?: Record<string, string[]> | null;
  endSessionURL?: string | null;
  jwksURL?: string | null;
  signingAlgorithms?: string[] | null;
  permissionSyncTtlMinutes?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SsoSamlConfigurationRecord {
  id: number;
  ssoProviderId: number;
  entryPoint: string;
  issuer: string;
  certificate: string;
  audience?: string | null;
  signRequest: boolean;
  wantAssertionsSigned: boolean;
  wantAuthnResponseSigned: boolean;
  forceAuthn: boolean;
  emailAttributeKeys?: string[] | null;
  roleAttributeKeys?: string[] | null;
  provisioningSecret?: string | null;
  roleMappings?: Record<string, string[]> | null;
  spSigningCertificate?: string | null;
  spSigningKeyEncrypted?: string | null;
  spSigningKeyEncryptionKeyId?: string | null;
  idpIssuer?: string | null;
  logoutURL?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SsoProviderRecord {
  id: number;
  name: string;
  type: SSOProviderType;
  createdAt: Date;
  updatedAt: Date;
  oidcConfiguration?: SsoOidcConfigurationRecord;
  samlConfiguration?: SsoSamlConfigurationRecord;
}

/** Columns a new configuration is created with (everything but id and timestamps). */
export type NewSsoOidcConfiguration = Partial<Omit<SsoOidcConfigurationRecord, 'id' | 'createdAt' | 'updatedAt'>> &
  Pick<
    SsoOidcConfigurationRecord,
    'issuer' | 'authorizationURL' | 'tokenURL' | 'userInfoURL' | 'clientId' | 'clientSecret'
  >;
export type NewSsoSamlConfiguration = Partial<Omit<SsoSamlConfigurationRecord, 'id' | 'createdAt' | 'updatedAt'>> &
  Pick<SsoSamlConfigurationRecord, 'entryPoint' | 'issuer' | 'certificate'>;
/** A partial update of the stored columns; an explicit null clears a nullable column. */
export type SsoOidcConfigurationChanges = Partial<
  Omit<SsoOidcConfigurationRecord, 'id' | 'ssoProviderId' | 'createdAt' | 'updatedAt'>
>;
export type SsoSamlConfigurationChanges = Partial<
  Omit<SsoSamlConfigurationRecord, 'id' | 'ssoProviderId' | 'createdAt' | 'updatedAt'>
>;
