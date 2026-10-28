import {
  SSOProvider,
  SSOProviderOIDCConfiguration,
  SSOProviderSAMLConfiguration,
  SSOProviderType,
} from '@attraccess/database-entities';

import { Injectable, BadRequestException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository, DeepPartial } from 'typeorm';

import { EncryptionService } from '../../../encryption/encryption.service';

import { LicenseService, LicenseModuleType } from '../../../license/license.service';

import {
  CreateSSOProviderDto,
  CreateSAMLConfigurationDto,
  CreateOIDCConfigurationDto,
} from './dto/create-sso-provider.dto';

import {
  UpdateSSOProviderDto,
  UpdateSAMLConfigurationDto,
  UpdateOIDCConfigurationDto,
} from './dto/update-sso-provider.dto';

import { SSOProviderNotFoundException } from './errors';

import { OIDC_SIGNING_ALGORITHMS, trustedEndpoint } from './logout-endpoints';

type SAMLConfigEntity = SSOProviderSAMLConfiguration & { provisioningSecret?: string | null };

/** SAML update fields stored as given; an explicit null (e.g. roleMappings) clears the column. */
const SAML_UPDATE_PASSTHROUGH_FIELDS = [
  'idpIssuer',
  'logoutURL',
  'entryPoint',
  'issuer',
  'audience',
  'signRequest',
  'wantAssertionsSigned',
  'wantAuthnResponseSigned',
  'forceAuthn',
  'emailAttributeKeys',
  'roleMappings',
] as const;

@Injectable()
export class SSOService {
  public constructor(
    @InjectRepository(SSOProvider)
    protected ssoProviderRepository: Repository<SSOProvider>,
    @InjectRepository(SSOProviderOIDCConfiguration)
    protected oidcConfigRepository: Repository<SSOProviderOIDCConfiguration>,
    @InjectRepository(SSOProviderSAMLConfiguration)
    protected samlConfigRepository: Repository<SSOProviderSAMLConfiguration>,
    protected licenseService: LicenseService,
    protected readonly encryptionService: EncryptionService,
  ) {}

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

  protected async createSAMLConfiguration(
    providerId: number,
    config: CreateSAMLConfigurationDto,
    repository = this.samlConfigRepository,
  ): Promise<SSOProviderSAMLConfiguration> {
    if (config.logoutURL) trustedEndpoint(config.logoutURL);
    if (config.logoutURL && !config.idpIssuer?.trim())
      throw new BadRequestException('SAML logout requires an IdP issuer');
    const shouldSignRequests = Boolean(config.signRequest || config.logoutURL);
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

  protected async updateSAMLConfiguration(
    providerId: number,
    config: UpdateSAMLConfigurationDto,
    repository = this.samlConfigRepository,
  ): Promise<SSOProviderSAMLConfiguration> {
    if (config.logoutURL) trustedEndpoint(config.logoutURL);
    const existing = await repository.findOne({ where: { ssoProviderId: providerId } });
    if (!existing) {
      throw new BadRequestException('SAML configuration not found for provider');
    }

    const payload = this.buildSAMLConfigurationUpdate(config, existing);
    this.assertSAMLConfigurationUsable(config, payload, existing);

    await repository.update({ ssoProviderId: providerId }, payload);
    return repository.findOne({ where: { ssoProviderId: providerId } });
  }

  /** Copies provided fields; normalizes and encrypts the sensitive ones. Explicit null clears a column. */
  protected buildSAMLConfigurationUpdate(
    config: UpdateSAMLConfigurationDto,
    existing: SSOProviderSAMLConfiguration,
  ): Partial<SAMLConfigEntity> {
    const payload: Partial<SAMLConfigEntity> = {};
    for (const key of SAML_UPDATE_PASSTHROUGH_FIELDS) {
      if (config[key] !== undefined) Object.assign(payload, { [key]: config[key] });
    }
    if (typeof config.certificate !== 'undefined') {
      payload.certificate = this.normalizeCertificate(config.certificate);
    }
    if (typeof config.provisioningSecret !== 'undefined') {
      const trimmed = config.provisioningSecret?.trim();
      payload.provisioningSecret = trimmed ? this.encryptionService.encrypt(trimmed) : null;
    }
    if (typeof config.spSigningCertificate !== 'undefined') {
      payload.spSigningCertificate = config.spSigningCertificate
        ? this.normalizeCertificate(config.spSigningCertificate)
        : null;
    }
    if (typeof config.spSigningPrivateKey !== 'undefined') {
      Object.assign(payload, this.buildSigningKeyUpdate(config.spSigningPrivateKey, existing));
    }
    return payload;
  }

  /** An empty key clears the stored key; a canonical-equivalent key is not re-encrypted. */
  protected buildSigningKeyUpdate(
    privateKey: string | null,
    existing: SSOProviderSAMLConfiguration,
  ): Partial<SAMLConfigEntity> {
    if (!privateKey) return { spSigningKeyEncrypted: null, spSigningKeyEncryptionKeyId: null };
    const canonicalPrivateKey = this.canonicalizePrivateKey(privateKey);
    const existingPrivateKey = existing.spSigningKeyEncrypted
      ? this.encryptionService.decryptIfEncrypted(existing.spSigningKeyEncrypted)
      : null;
    if (canonicalPrivateKey === (existingPrivateKey ? this.canonicalizePrivateKey(existingPrivateKey) : null))
      return {};
    return {
      spSigningKeyEncrypted: this.encryptionService.encrypt(canonicalPrivateKey),
      spSigningKeyEncryptionKeyId: this.getEncryptionKeyId(),
    };
  }

  /** Validates the configuration that results from applying the update to the stored one. */
  protected assertSAMLConfigurationUsable(
    config: UpdateSAMLConfigurationDto,
    payload: Partial<SAMLConfigEntity>,
    existing: SSOProviderSAMLConfiguration,
  ): void {
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

    const nextLogoutURL = config.logoutURL === undefined ? existing.logoutURL : config.logoutURL;
    const nextIdpIssuer = config.idpIssuer === undefined ? existing.idpIssuer : config.idpIssuer;
    if (nextLogoutURL && !nextIdpIssuer?.trim()) throw new BadRequestException('SAML logout requires an IdP issuer');
    this.ensureSigningMaterialAvailability(Boolean(nextSignRequest || nextLogoutURL), nextSigningCert, nextSigningKey);
  }

  protected normalizeCertificate(cert: string): string {
    return cert
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  protected encryptPrivateKey(privateKey: string): string {
    const canonical = this.canonicalizePrivateKey(privateKey);
    return this.encryptionService.encrypt(canonical);
  }

  protected canonicalizePrivateKey(privateKey: string): string {
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

  protected getEncryptionKeyId(): string {
    return 'default';
  }

  protected ensureSigningMaterialAvailability(
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

  private validateOidcLogoutConfig(config: {
    endSessionURL?: string | null;
    jwksURL?: string | null;
    signingAlgorithms?: string[] | null;
  }): void {
    for (const endpoint of [config.endSessionURL, config.jwksURL]) if (endpoint) trustedEndpoint(endpoint);
    if (config.signingAlgorithms?.some((algorithm) => !OIDC_SIGNING_ALGORITHMS.includes(algorithm))) {
      throw new BadRequestException('Unsupported OIDC signing algorithm');
    }
  }

  protected async createOIDCConfiguration(
    providerId: number,
    config: CreateOIDCConfigurationDto,
    repository = this.oidcConfigRepository,
  ): Promise<SSOProviderOIDCConfiguration> {
    this.validateOidcLogoutConfig(config);
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
    this.validateOidcLogoutConfig(updateConfig);
    const payload: Partial<SSOProviderOIDCConfiguration> = {};
    for (const key of ['endSessionURL', 'jwksURL', 'signingAlgorithms'] as const) {
      if (updateConfig[key] !== undefined) Object.assign(payload, { [key]: updateConfig[key] });
    }

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
    if (typeof updateConfig.permissionSyncTtlMinutes !== 'undefined') {
      // explicit null falls back to the global default
      payload.permissionSyncTtlMinutes = updateConfig.permissionSyncTtlMinutes;
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
