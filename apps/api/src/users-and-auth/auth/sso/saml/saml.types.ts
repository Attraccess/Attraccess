import { Request } from 'express';
import { SSOProviderSAMLConfiguration } from '@attraccess/application-models';

export interface SSOSamlRequestOptions {
  providerId: number;
  samlConfiguration: SSOProviderSAMLConfiguration;
  callbackUrl: string;
}

export type SSOSamlRequest = Request & {
  ssoSamlOptions?: SSOSamlRequestOptions;
};
