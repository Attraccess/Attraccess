import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SSOProvider,
  SSOProviderOIDCConfiguration,
  SSOProviderSAMLConfiguration,
  Setting,
} from '@attraccess/database-entities';
import { SSO_LINK_SECRET_STORE } from '../../../users-and-auth/auth/sso/link-token-secret.port';
import { SSO_PROVIDER_STORE } from '../../../users-and-auth/auth/sso/providers/sso-provider.port';
import { TypeOrmSsoLinkSecretStore } from './typeorm-sso-link-secret-store';
import { TypeOrmSsoProviderStore } from './typeorm-sso-provider-store';

/** SSO providers and the link-token secret. The audit recorder comes from the global audit module. */
@Module({
  imports: [
    TypeOrmModule.forFeature([SSOProvider, SSOProviderOIDCConfiguration, SSOProviderSAMLConfiguration, Setting]),
  ],
  providers: [
    TypeOrmSsoProviderStore,
    TypeOrmSsoLinkSecretStore,
    { provide: SSO_PROVIDER_STORE, useExisting: TypeOrmSsoProviderStore },
    { provide: SSO_LINK_SECRET_STORE, useExisting: TypeOrmSsoLinkSecretStore },
  ],
  exports: [SSO_PROVIDER_STORE, SSO_LINK_SECRET_STORE],
})
export class SsoPersistenceModule {}
