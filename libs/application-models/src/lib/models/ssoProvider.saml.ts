import { SSOProvider } from './ssoProvider';

export interface SSOProviderSAMLConfiguration {
  id: number;
  ssoProviderId: number;
  ssoProvider: SSOProvider;
  entryPoint: string;
  issuer: string;
  certificate: string;
  audience?: string | null;
  signRequest: boolean;
  wantAssertionsSigned: boolean;
  wantAuthnResponseSigned: boolean;
  forceAuthn: boolean;
  emailAttributeKeys?: string[] | null;
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
