import { Request } from 'express';
import type { SsoSamlConfigurationRecord } from '@attraccess/application-models';

export interface SSOSamlRequestOptions {
  providerId: number;
  samlConfiguration: SsoSamlConfigurationRecord;
  callbackUrl: string;
}

export type SSOSamlRequest = Request & {
  ssoSamlOptions?: SSOSamlRequestOptions;
};
