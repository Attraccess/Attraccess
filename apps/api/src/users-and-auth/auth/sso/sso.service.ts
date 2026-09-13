import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import {
  SSOProvider,
  SSOProviderOIDCConfiguration,
  SSOProviderSAMLConfiguration,
  SSOProviderType,
} from '@attraccess/database-entities';
import {
  CreateSSOProviderDto,
  CreateSAMLConfigurationDto,
  CreateOIDCConfigurationDto,
} from './dto/create-sso-provider.dto';
import { UpdateSSOProviderDto, UpdateSAMLConfigurationDto, UpdateOIDCConfigurationDto } from './dto/update-sso-provider.dto';
import { SSOProviderNotFoundException } from './errors';
import { LicenseModuleType, LicenseService } from '../../../license/license.service';
import { EncryptionService } from '../../../encryption/encryption.service';

@Injectable()
export class SSOService {
  public constructor(
    @InjectRepository(SSOProvider)
    private ssoProviderRepository: Repository<SSOProvider>,
    @InjectRepository(SSOProviderOIDCConfiguration)
    private oidcConfigRepository: Repository<SSOProviderOIDCConfiguration>,
    @InjectRepository(SSOProviderSAMLConfiguration)
    private samlConfigRepository: Repository<SSOProviderSAMLConfiguration>,
    private licenseService: LicenseService,
    private readonly encryptionService: EncryptionService,
  ) { }

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
    providerId: number
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
          await this.createOIDCConfiguration(provider.id, createDto.oidcConfiguration, manager.getRepository(SSOProviderOIDCConfiguration));
          break;
        case SSOProviderType.SAML:
          if (!createDto.samlConfiguration) throw new BadRequestException('Missing SAML configuration payload');
          await this.createSAMLConfiguration(provider.id, createDto.samlConfiguration, manager.getRepository(SSOProviderSAMLConfiguration));
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
        await this.updateOIDCConfiguration(provider.id, updateDto.oidcConfiguration, manager.getRepository(SSOProviderOIDCConfiguration));
      }
      if (provider.type === SSOProviderType.SAML && updateDto.samlConfiguration) {
        await this.updateSAMLConfiguration(provider.id, updateDto.samlConfiguration, manager.getRepository(SSOProviderSAMLConfiguration));
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
      if (provider.oidcConfiguration) await manager.getRepository(SSOProviderOIDCConfiguration).delete(provider.oidcConfiguration.id);
      if (provider.samlConfiguration) await manager.getRepository(SSOProviderSAMLConfiguration).delete(provider.samlConfiguration.id);
      await manager.getRepository(SSOProvider).delete(id);
    });
  }

  private async createOIDCConfiguration(
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

  private async updateOIDCConfiguration(
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

  private async createSAMLConfiguration(
    providerId: number,
    config: CreateSAMLConfigurationDto,
    repository = this.samlConfigRepository,
  ): Promise<SSOProviderSAMLConfiguration> {
    const shouldSignRequests = Boolean(config.signRequest);
    const normalizedCertificate = this.normalizeCertificate(config.certificate);
    const normalizedSpSigningCertificate = config.spSigningCertificate
      ? this.normalizeCertificate(config.spSigningCertificate)
      : null;
    const encryptedPrivateKey = config.spSigningPrivateKey ? this.encryptPrivateKey(config.spSigningPrivateKey) : null;
    const provisioningSecret = config.provisioningSecret?.trim() || null;
    const encryptedProvisioningSecret = provisioningSecret ? this.encryptionService.encrypt(provisioningSecret) : null;

    this.ensureSigningMaterialAvailability(shouldSignRequests, normalizedSpSigningCertificate, encryptedPrivateKey);

    const { spSigningCertificate: unusedSpCert, spSigningPrivateKey: unusedSpKey, ...persistableConfig } = config;
    void unusedSpCert;
    void unusedSpKey;

    type SAMLConfigEntity = SSOProviderSAMLConfiguration & { provisioningSecret?: string | null };

    const newConfig = repository.create({
      ...persistableConfig,
      certificate: normalizedCertificate,
      provisioningSecret: encryptedProvisioningSecret,
      spSigningCertificate: normalizedSpSigningCertificate,
      spSigningKeyEncrypted: encryptedPrivateKey,
      spSigningKeyEncryptionKeyId: encryptedPrivateKey ? this.getEncryptionKeyId() : null,
      ssoProviderId: providerId,
    } as DeepPartial<SAMLConfigEntity>);

    return repository.save(newConfig);
  }

  private async updateSAMLConfiguration(
    providerId: number,
    config: UpdateSAMLConfigurationDto,
    repository = this.samlConfigRepository,
  ): Promise<SSOProviderSAMLConfiguration> {
    const existing = await repository.findOne({ where: { ssoProviderId: providerId } });
    if (!existing) {
      throw new BadRequestException('SAML configuration not found for provider');
    }

    type SAMLConfigEntity = SSOProviderSAMLConfiguration & { provisioningSecret?: string | null };
    const payload: Partial<SAMLConfigEntity> = {};

    if (typeof config.entryPoint !== 'undefined') {
      payload.entryPoint = config.entryPoint;
    }
    if (typeof config.issuer !== 'undefined') {
      payload.issuer = config.issuer;
    }
    if (typeof config.certificate !== 'undefined') {
      payload.certificate = this.normalizeCertificate(config.certificate);
    }
    if (typeof config.audience !== 'undefined') {
      payload.audience = config.audience;
    }
    if (typeof config.signRequest !== 'undefined') {
      payload.signRequest = config.signRequest;
    }
    if (typeof config.wantAssertionsSigned !== 'undefined') {
      payload.wantAssertionsSigned = config.wantAssertionsSigned;
    }
    if (typeof config.wantAuthnResponseSigned !== 'undefined') {
      payload.wantAuthnResponseSigned = config.wantAuthnResponseSigned;
    }
    if (typeof config.forceAuthn !== 'undefined') {
      payload.forceAuthn = config.forceAuthn;
    }
    if (typeof config.emailAttributeKeys !== 'undefined') {
      payload.emailAttributeKeys = config.emailAttributeKeys;
    }
    if (typeof config.provisioningSecret !== 'undefined') {
      const trimmed = config.provisioningSecret?.trim();
      payload.provisioningSecret = trimmed ? this.encryptionService.encrypt(trimmed) : null;
    }
    if (typeof config.roleMappings !== 'undefined') {
      // explicit null clears the column
      payload.roleMappings = config.roleMappings;
    }
    if (typeof config.spSigningCertificate !== 'undefined') {
      payload.spSigningCertificate = config.spSigningCertificate
        ? this.normalizeCertificate(config.spSigningCertificate)
        : null;
    }
    if (typeof config.spSigningPrivateKey !== 'undefined') {
      if (config.spSigningPrivateKey) {
        payload.spSigningKeyEncrypted = this.encryptPrivateKey(config.spSigningPrivateKey);
        payload.spSigningKeyEncryptionKeyId = this.getEncryptionKeyId();
      } else {
        payload.spSigningKeyEncrypted = null;
        payload.spSigningKeyEncryptionKeyId = null;
      }
    }

    const nextSignRequest =
      typeof payload.signRequest !== 'undefined' ? payload.signRequest : (existing.signRequest ?? false);
    const nextSigningCert =
      typeof payload.spSigningCertificate !== 'undefined'
        ? payload.spSigningCertificate
        : (existing.spSigningCertificate ?? null);
    const nextSigningKey =
      typeof payload.spSigningKeyEncrypted !== 'undefined'
        ? payload.spSigningKeyEncrypted
        : (existing.spSigningKeyEncrypted ?? null);

    this.ensureSigningMaterialAvailability(Boolean(nextSignRequest), nextSigningCert, nextSigningKey);

    await repository.update({ ssoProviderId: providerId }, payload);
    return repository.findOne({ where: { ssoProviderId: providerId } });
  }

  /**
   * Decrypts provider secrets in place for use in the app. Assumes stored values
   * are already encrypted (see migration EncryptSensitiveData).
   */
  private decryptProviderSecrets(provider?: SSOProvider | null): void {
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

  private normalizeCertificate(cert: string): string {
    return cert
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  private encryptPrivateKey(privateKey: string): string {
    const canonical = this.canonicalizePrivateKey(privateKey);
    return this.encryptionService.encrypt(canonical);
  }

  private canonicalizePrivateKey(privateKey: string): string {
    const trimmed = privateKey.trim();
    const beginMatch = trimmed.match(/-----BEGIN ([^-]+)-----/);
    const blockLabel = beginMatch?.[1] ?? 'PRIVATE KEY';
    const body = trimmed
      .replace(/-----BEGIN [^-]+-----/g, '')
      .replace(/-----END [^-]+-----/g, '')
      .replace(/\s+/g, '');
    const chunked = body.match(/.{1,64}/g)?.join('\n') ?? body;
    return `-----BEGIN ${blockLabel}-----\n${chunked}\n-----END ${blockLabel}-----`;
  }

  private getEncryptionKeyId(): string {
    return 'default';
  }

  private ensureSigningMaterialAvailability(
    shouldSignRequests: boolean,
    spCertificate?: string | null,
    encryptedPrivateKey?: string | null,
  ): void {
    if (shouldSignRequests && (!spCertificate || !encryptedPrivateKey)) {
      throw new BadRequestException(
        'Signing AuthnRequests requires providing both a Service Provider certificate and private key.',
      );
    }
  }
}
