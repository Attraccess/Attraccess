import { SSOProvider } from './ssoProvider';

export interface SSOProviderOIDCConfiguration {
  id: number;
  ssoProviderId: number;
  issuer: string;
  authorizationURL: string;
  tokenURL: string;
  userInfoURL: string;
  clientId: string;
  clientSecret: string;
  scopes: string[] | null;
  usernameClaimPaths: string[] | null;
  emailClaimPaths: string[] | null;
  roleMappings?: Record<string, string[]> | null;
  endSessionURL?: string | null;
  jwksURL?: string | null;
  signingAlgorithms?: string[] | null;
  createdAt: Date;
  updatedAt: Date;
  ssoProvider: SSOProvider;
}
