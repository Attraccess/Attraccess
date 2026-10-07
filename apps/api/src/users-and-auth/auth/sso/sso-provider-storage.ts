import {
  SSOProvider,
  SSOProviderOIDCConfiguration,
  SSOProviderSAMLConfiguration,
  SSOProviderType,
} from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { LicenseModuleType } from '../../../license/license.service';
import { CreateSSOProviderDto } from './dto/create-sso-provider.dto';
import { UpdateSSOProviderDto } from './dto/update-sso-provider.dto';
import { SSOProviderNotFoundException } from './errors';
import { SsoSamlConfigurationImplementation } from './sso-saml-configuration';
export abstract class SsoProviderStorageImplementation extends SsoSamlConfigurationImplementation {
  public async getAllProviders(): Promise<SSOProvider[]> {
    const providers = await this.ssoProviderRepository.find({
      relations: ['oidcConfiguration', 'samlConfiguration'],
    });
    providers.forEach((provider) => this.decryptProviderSecrets(provider));
    return providers;
  }

  public async getProviderById(id: number): Promise<SSOProvider> {
    const provider = await this.ssoProviderRepository.findOne({
      where: { id },
      relations: ['oidcConfiguration', 'samlConfiguration'],
    });

    if (!provider) {
      throw new SSOProviderNotFoundException();
    }

    this.decryptProviderSecrets(provider);
    return provider;
  }

  public async getProviderByTypeAndIdWithConfiguration(
    ssoType: SSOProviderType,
    providerId: number,
  ): Promise<SSOProvider | null> {
    const relations: string[] = [];

    if (ssoType === SSOProviderType.OIDC) {
      relations.push('oidcConfiguration');
    }

    if (ssoType === SSOProviderType.SAML) {
      relations.push('samlConfiguration');
    }

    const provider = await this.ssoProviderRepository.findOne({
      where: { type: ssoType, id: providerId },
      relations,
    });
    if (provider) {
      this.decryptProviderSecrets(provider);
    }
    return provider;
  }

  public async createProvider(createDto: CreateSSOProviderDto): Promise<SSOProvider> {
    // verifying usage limits
    await this.licenseService.verifyLicense({
      modules: [LicenseModuleType.SSO],
    });

    const savedProvider = await this.ssoProviderRepository.manager.transaction(async (manager) => {
      const providerRepository = manager.getRepository(SSOProvider);
      const newProvider = providerRepository.create({ name: createDto.name, type: createDto.type });
      const provider = await providerRepository.save(newProvider);
      switch (createDto.type) {
        case SSOProviderType.OIDC:
          if (!createDto.oidcConfiguration) throw new BadRequestException('Missing OIDC configuration payload');
          await this.createOIDCConfiguration(
            provider.id,
            createDto.oidcConfiguration,
            manager.getRepository(SSOProviderOIDCConfiguration),
          );
          break;
        case SSOProviderType.SAML:
          if (!createDto.samlConfiguration) throw new BadRequestException('Missing SAML configuration payload');
          await this.createSAMLConfiguration(
            provider.id,
            createDto.samlConfiguration,
            manager.getRepository(SSOProviderSAMLConfiguration),
          );
          break;
        default:
          throw new BadRequestException(`Unsupported SSO provider type: ${createDto.type}`);
      }
      const loaded = await providerRepository.findOne({
        where: { type: provider.type, id: provider.id },
        relations: [provider.type === SSOProviderType.OIDC ? 'oidcConfiguration' : 'samlConfiguration'],
      });
      if (!loaded) throw new BadRequestException('Provider not found after create');
      this.decryptProviderSecrets(loaded);
      return loaded;
    });
    return savedProvider;
  }

  public async updateProvider(id: number, updateDto: UpdateSSOProviderDto): Promise<SSOProvider> {
    await this.licenseService.verifyLicense({ modules: [LicenseModuleType.SSO] });
    const provider = await this.getProviderById(id);

    return this.ssoProviderRepository.manager.transaction(async (manager) => {
      if (provider.type === SSOProviderType.OIDC && updateDto.oidcConfiguration) {
        await this.updateOIDCConfiguration(
          provider.id,
          updateDto.oidcConfiguration,
          manager.getRepository(SSOProviderOIDCConfiguration),
        );
      }
      if (provider.type === SSOProviderType.SAML && updateDto.samlConfiguration) {
        await this.updateSAMLConfiguration(
          provider.id,
          updateDto.samlConfiguration,
          manager.getRepository(SSOProviderSAMLConfiguration),
        );
      }
      if (updateDto.name) await manager.getRepository(SSOProvider).update(provider.id, { name: updateDto.name });
      const updated = await manager.getRepository(SSOProvider).findOne({
        where: { type: provider.type, id: provider.id },
        relations: [provider.type === SSOProviderType.OIDC ? 'oidcConfiguration' : 'samlConfiguration'],
      });
      if (!updated) throw new BadRequestException('Provider not found after update');
      this.decryptProviderSecrets(updated);
      return updated;
    });
  }

  public async deleteProvider(id: number): Promise<void> {
    await this.licenseService.verifyLicense({ modules: [LicenseModuleType.SSO] });
    const provider = await this.getProviderById(id);
    await this.ssoProviderRepository.manager.transaction(async (manager) => {
      if (provider.oidcConfiguration)
        await manager.getRepository(SSOProviderOIDCConfiguration).delete(provider.oidcConfiguration.id);
      if (provider.samlConfiguration)
        await manager.getRepository(SSOProviderSAMLConfiguration).delete(provider.samlConfiguration.id);
      await manager.getRepository(SSOProvider).delete(id);
    });
  }
}
