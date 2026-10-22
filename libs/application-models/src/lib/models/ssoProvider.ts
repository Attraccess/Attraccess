import { SSOProviderOIDCConfiguration } from './ssoProvider.oidc';
import { SSOProviderSAMLConfiguration } from './ssoProvider.saml';

export enum SSOProviderType {
  OIDC = 'OIDC',
  SAML = 'SAML',
}

export interface SSOProvider {
  id: number;
  name: string;
  type: SSOProviderType;
  createdAt: Date;
  updatedAt: Date;
  oidcConfiguration?: SSOProviderOIDCConfiguration;
  samlConfiguration?: SSOProviderSAMLConfiguration;
}
