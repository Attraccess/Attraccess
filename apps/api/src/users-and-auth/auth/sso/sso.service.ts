import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SSOProvider, SSOProviderOIDCConfiguration, SSOProviderType } from '@attraccess/database-entities';
import { CreateSSOProviderDto } from './dto/create-sso-provider.dto';
import { UpdateSSOProviderDto } from './dto/update-sso-provider.dto';
import { SSOProviderNotFoundException } from './errors';
import { LicenseModuleType, LicenseService } from '../../../license/license.service';

@Injectable()
export class SSOService {
  public constructor(
    @InjectRepository(SSOProvider)
    private ssoProviderRepository: Repository<SSOProvider>,
    @InjectRepository(SSOProviderOIDCConfiguration)
    private oidcConfigRepository: Repository<SSOProviderOIDCConfiguration>,
    private licenseService: LicenseService
  ) {}

  public async getAllProviders(): Promise<SSOProvider[]> {
    return this.ssoProviderRepository.find();
  }

  public async getProviderById(id: number): Promise<SSOProvider> {
    const provider = await this.ssoProviderRepository.findOne({
      where: { id },
      relations: ['oidcConfiguration'],
    });

    if (!provider) {
      throw new SSOProviderNotFoundException();
    }

    return provider;
  }

  public getProviderByTypeAndIdWithConfiguration(ssoType: SSOProviderType, providerId: number): Promise<SSOProvider> {
    const relations = [];

    if (ssoType === SSOProviderType.OIDC) {
      relations.push('oidcConfiguration');
    }

    return this.ssoProviderRepository.findOne({
      where: { type: ssoType, id: providerId },
      relations,
    });
  }

  public async createProvider(createDto: CreateSSOProviderDto): Promise<SSOProvider> {
    // verifying usage limits
    await this.licenseService.verifyLicense({
      modules: [LicenseModuleType.SSO],
    });

    const newProvider = this.ssoProviderRepository.create({
      name: createDto.name,
      type: createDto.type,
    });

    const savedProvider = await this.ssoProviderRepository.save(newProvider);

    if (createDto.type === SSOProviderType.OIDC && createDto.oidcConfiguration) {
      await this.createOIDCConfiguration(savedProvider.id, createDto.oidcConfiguration);
    }

    return this.getProviderByTypeAndIdWithConfiguration(savedProvider.type, savedProvider.id);
  }

  public async updateProvider(id: number, updateDto: UpdateSSOProviderDto): Promise<SSOProvider> {
    const provider = await this.getProviderById(id);

    // Handle OIDC configuration
    if (provider.type === SSOProviderType.OIDC && updateDto.oidcConfiguration) {
      await this.updateOIDCConfiguration(provider.id, updateDto.oidcConfiguration);
    }

    await this.ssoProviderRepository.update(provider.id, { name: updateDto.name });

    return this.getProviderByTypeAndIdWithConfiguration(provider.type, provider.id);
  }

  public async deleteProvider(id: number): Promise<void> {
    const provider = await this.getProviderById(id);
    if (provider.oidcConfiguration) {
      await this.oidcConfigRepository.delete(provider.oidcConfiguration.id);
    }
    await this.ssoProviderRepository.delete(id);
  }

  private async createOIDCConfiguration(
    providerId: number,
    config: {
      issuer: string;
      authorizationURL: string;
      tokenURL: string;
      userInfoURL: string;
      clientId: string;
      clientSecret: string;
    }
  ): Promise<SSOProviderOIDCConfiguration> {
    const newConfig = this.oidcConfigRepository.create({
      ...config,
      ssoProviderId: providerId,
    });

    return this.oidcConfigRepository.save(newConfig);
  }

  private async updateOIDCConfiguration(
    providerId: number,
    updateConfig: Partial<{
      issuer: string;
      authorizationURL: string;
      tokenURL: string;
      userInfoURL: string;
      clientId: string;
      clientSecret: string;
    }>
  ): Promise<SSOProviderOIDCConfiguration> {
    await this.oidcConfigRepository.update(providerId, updateConfig);
    return await this.oidcConfigRepository.findOne({ where: { ssoProviderId: providerId } });
  }
}
