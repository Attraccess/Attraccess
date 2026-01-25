import { Request } from 'express';
import { SSOProviderSAMLConfiguration } from '@attraccess/database-entities';

export interface SSOSamlRequestOptions {
  providerId: number;
  samlConfiguration: SSOProviderSAMLConfiguration;
  callbackUrl: string;
}

export type SSOSamlRequest = Request & {
  ssoSamlOptions?: SSOSamlRequestOptions;
};
