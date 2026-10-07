import { SSOProvider, SSOProviderOIDCConfiguration } from '@attraccess/database-entities';
import { CreateOIDCConfigurationDto } from './dto/create-sso-provider.dto';
import { UpdateOIDCConfigurationDto } from './dto/update-sso-provider.dto';
import { SSOServiceRouteContext } from './sso.service.route-context';
export abstract class SsoOidcConfigurationImplementation extends SSOServiceRouteContext {
  protected async createOIDCConfiguration(
    providerId: number,
    config: CreateOIDCConfigurationDto,
    repository = this.oidcConfigRepository,
  ): Promise<SSOProviderOIDCConfiguration> {
    const encryptedSecret = this.encryptionService.encrypt(config.clientSecret);
    const newConfig = repository.create({
      ...config,
      clientSecret: encryptedSecret,
      ssoProviderId: providerId,
    });

    return repository.save(newConfig);
  }

  protected async updateOIDCConfiguration(
    providerId: number,
    updateConfig: UpdateOIDCConfigurationDto,
    repository = this.oidcConfigRepository,
  ): Promise<SSOProviderOIDCConfiguration> {
    const payload: Partial<SSOProviderOIDCConfiguration> = {};

    if (typeof updateConfig.issuer !== 'undefined') {
      payload.issuer = updateConfig.issuer;
    }
    if (typeof updateConfig.authorizationURL !== 'undefined') {
      payload.authorizationURL = updateConfig.authorizationURL;
    }
    if (typeof updateConfig.tokenURL !== 'undefined') {
      payload.tokenURL = updateConfig.tokenURL;
    }
    if (typeof updateConfig.userInfoURL !== 'undefined') {
      payload.userInfoURL = updateConfig.userInfoURL;
    }
    if (typeof updateConfig.clientId !== 'undefined') {
      payload.clientId = updateConfig.clientId;
    }
    if (typeof updateConfig.clientSecret !== 'undefined' && updateConfig.clientSecret !== null) {
      const trimmed = updateConfig.clientSecret.trim();
      if (trimmed) {
        payload.clientSecret = this.encryptionService.encrypt(trimmed);
      }
      // empty string means "unchanged" — the frontend never receives the real secret back
    }
    if (typeof updateConfig.scopes !== 'undefined') {
      payload.scopes = updateConfig.scopes;
    }
    if (typeof updateConfig.usernameClaimPaths !== 'undefined') {
      payload.usernameClaimPaths = updateConfig.usernameClaimPaths;
    }
    if (typeof updateConfig.emailClaimPaths !== 'undefined') {
      payload.emailClaimPaths = updateConfig.emailClaimPaths;
    }
    if (typeof updateConfig.roleMappings !== 'undefined') {
      // explicit null clears the column
      payload.roleMappings = updateConfig.roleMappings;
    }

    await repository.update({ ssoProviderId: providerId }, payload);
    return repository.findOne({ where: { ssoProviderId: providerId } });
  }

  /**
   * Decrypts provider secrets in place for use in the app. Assumes stored values
   * are already encrypted (see migration EncryptSensitiveData).
   */
  protected decryptProviderSecrets(provider?: SSOProvider | null): void {
    if (!provider) {
      return;
    }
    if (provider.oidcConfiguration?.clientSecret) {
      provider.oidcConfiguration.clientSecret =
        this.encryptionService.decryptIfEncrypted(provider.oidcConfiguration.clientSecret) ??
        provider.oidcConfiguration.clientSecret;
    }
    if (provider.samlConfiguration?.provisioningSecret) {
      provider.samlConfiguration.provisioningSecret =
        this.encryptionService.decryptIfEncrypted(provider.samlConfiguration.provisioningSecret) ??
        provider.samlConfiguration.provisioningSecret;
    }
  }
}
