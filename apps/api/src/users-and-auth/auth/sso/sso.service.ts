import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

  public async getAllProviders(): Promise<SSOProvider[]> {
    return this.ssoProviderRepository.find({
      relations: ['oidcConfiguration', 'samlConfiguration'],
    });
  }

  public async getProviderById(id: number): Promise<SSOProvider> {
    const provider = await this.ssoProviderRepository.findOne({
      where: { id },
      relations: ['oidcConfiguration', 'samlConfiguration'],
    });

    if (!provider) {
      throw new SSOProviderNotFoundException();
    }

    return provider;
  }

  public getProviderByTypeAndIdWithConfiguration(ssoType: SSOProviderType, providerId: number): Promise<SSOProvider> {
    const relations: string[] = [];

    if (ssoType === SSOProviderType.OIDC) {
      relations.push('oidcConfiguration');
    }

    if (ssoType === SSOProviderType.SAML) {
      relations.push('samlConfiguration');
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

    switch (createDto.type) {
      case SSOProviderType.OIDC: {
        if (!createDto.oidcConfiguration) {
          throw new BadRequestException('Missing OIDC configuration payload');
        }
        await this.createOIDCConfiguration(savedProvider.id, createDto.oidcConfiguration);
        break;
      }
      case SSOProviderType.SAML: {
        if (!createDto.samlConfiguration) {
          throw new BadRequestException('Missing SAML configuration payload');
        }
        await this.createSAMLConfiguration(savedProvider.id, createDto.samlConfiguration);
        break;
      }
      default:
        throw new BadRequestException(`Unsupported SSO provider type: ${createDto.type}`);
    }

    return this.getProviderByTypeAndIdWithConfiguration(savedProvider.type, savedProvider.id);
  }

  public async updateProvider(id: number, updateDto: UpdateSSOProviderDto): Promise<SSOProvider> {
    const provider = await this.getProviderById(id);

    if (provider.type === SSOProviderType.OIDC && updateDto.oidcConfiguration) {
      await this.updateOIDCConfiguration(provider.id, updateDto.oidcConfiguration);
    }

    if (provider.type === SSOProviderType.SAML && updateDto.samlConfiguration) {
      await this.updateSAMLConfiguration(provider.id, updateDto.samlConfiguration);
    }

    if (updateDto.name) {
      await this.ssoProviderRepository.update(provider.id, { name: updateDto.name });
    }

    return this.getProviderByTypeAndIdWithConfiguration(provider.type, provider.id);
  }

  public async deleteProvider(id: number): Promise<void> {
    const provider = await this.getProviderById(id);
    if (provider.oidcConfiguration) {
      await this.oidcConfigRepository.delete(provider.oidcConfiguration.id);
    }
    if (provider.samlConfiguration) {
      await this.samlConfigRepository.delete(provider.samlConfiguration.id);
    }
    await this.ssoProviderRepository.delete(id);
  }

  private async createOIDCConfiguration(
    providerId: number,
    config: CreateOIDCConfigurationDto,
  ): Promise<SSOProviderOIDCConfiguration> {
    const newConfig = this.oidcConfigRepository.create({
      ...config,
      ssoProviderId: providerId,
    });

    return this.oidcConfigRepository.save(newConfig);
  }

  private async updateOIDCConfiguration(
    providerId: number,
    updateConfig: UpdateOIDCConfigurationDto,
  ): Promise<SSOProviderOIDCConfiguration> {
    await this.oidcConfigRepository.update({ ssoProviderId: providerId }, updateConfig);
    return this.oidcConfigRepository.findOne({ where: { ssoProviderId: providerId } });
  }

  private async createSAMLConfiguration(
    providerId: number,
    config: CreateSAMLConfigurationDto,
  ): Promise<SSOProviderSAMLConfiguration> {
    const shouldSignRequests = Boolean(config.signRequest);
    const normalizedCertificate = this.normalizeCertificate(config.certificate);
    const normalizedSpSigningCertificate = config.spSigningCertificate
      ? this.normalizeCertificate(config.spSigningCertificate)
      : null;
    const encryptedPrivateKey = config.spSigningPrivateKey ? this.encryptPrivateKey(config.spSigningPrivateKey) : null;

    this.ensureSigningMaterialAvailability(shouldSignRequests, normalizedSpSigningCertificate, encryptedPrivateKey);

    const { spSigningCertificate: unusedSpCert, spSigningPrivateKey: unusedSpKey, ...persistableConfig } = config;
    void unusedSpCert;
    void unusedSpKey;

    const newConfig = this.samlConfigRepository.create({
      ...persistableConfig,
      certificate: normalizedCertificate,
      spSigningCertificate: normalizedSpSigningCertificate,
      spSigningKeyEncrypted: encryptedPrivateKey,
      spSigningKeyEncryptionKeyId: encryptedPrivateKey ? this.getEncryptionKeyId() : null,
      ssoProviderId: providerId,
    });

    return this.samlConfigRepository.save(newConfig);
  }

  private async updateSAMLConfiguration(
    providerId: number,
    config: UpdateSAMLConfigurationDto,
  ): Promise<SSOProviderSAMLConfiguration> {
    const existing = await this.samlConfigRepository.findOne({ where: { ssoProviderId: providerId } });
    if (!existing) {
      throw new BadRequestException('SAML configuration not found for provider');
    }

    const payload: Partial<SSOProviderSAMLConfiguration> = {};

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
    if (typeof config.permissionMappings !== 'undefined') {
      payload.permissionMappings = config.permissionMappings;
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

    await this.samlConfigRepository.update({ ssoProviderId: providerId }, payload);
    return this.samlConfigRepository.findOne({ where: { ssoProviderId: providerId } });
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
