import { SSOProviderType } from '@attraccess/application-models';
import type {
  NewSsoOidcConfiguration,
  NewSsoSamlConfiguration,
  SsoOidcConfigurationChanges,
  SsoProviderRecord,
  SsoSamlConfigurationChanges,
  SsoSamlConfigurationRecord,
} from '@attraccess/application-models';

import { Inject, Injectable, BadRequestException } from '@nestjs/common';

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
import { AUDIT_RECORDER, AuditActor, AuditRecorder } from '../../../audit/recorder/audit-event';
import { recordSsoProvisioningAudit, ssoProviderAuditEvent } from './audit/provider-audit';

import { OIDC_SIGNING_ALGORITHMS, trustedEndpoint } from './logout-endpoints';
import {
  SSO_PROVIDER_STORE,
  type SsoProviderChanges,
  type SsoProviderDraft,
  type SsoProviderStore,
} from './providers/sso-provider.port';

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
  'roleAttributeKeys',
  'roleMappings',
] as const;

/** An empty list means "use the defaults"; store it as null rather than the `simple-array` empty string. */
const emptyListToNull = <T>(value: T[] | null | undefined) => (value?.length === 0 ? null : value);

/** A claim path left blank means "use the defaults". */
const blankToNull = (value: string | null | undefined) => value?.trim() || null;

@Injectable()
export class SSOService {
  public constructor(
    @Inject(SSO_PROVIDER_STORE) protected readonly store: SsoProviderStore,
    protected licenseService: LicenseService,
    protected readonly encryptionService: EncryptionService,
    @Inject(AUDIT_RECORDER) protected readonly audit: AuditRecorder,
  ) {}

  /**
   * Records a committed `sso.provisioning.*` change a sign-in made (account creation, role sync). The provider's
   * configuration snapshot is loaded here, so the strategies record without touching audit themselves.
   */
  public async recordSignInProvisioning(
    type: SSOProviderType,
    providerId: number,
    userId: number,
    action: 'user_created' | 'permissions_synced',
    changes: unknown,
  ): Promise<void> {
    const provider = await this.getProviderByTypeAndIdWithConfiguration(type, providerId);
    if (provider) await recordSsoProvisioningAudit(this.audit, action, userId, provider, changes);
  }

  public async getAllProviders(): Promise<SsoProviderRecord[]> {
    const providers = await this.store.findAll();
    providers.forEach((provider) => this.decryptProviderSecrets(provider));
    return providers;
  }

  public async getProviderById(id: number): Promise<SsoProviderRecord> {
    const provider = await this.store.findById(id);

    if (!provider) {
      throw new SSOProviderNotFoundException();
    }

    this.decryptProviderSecrets(provider);
    return provider;
  }

  public async getProviderByTypeAndIdWithConfiguration(
    ssoType: SSOProviderType,
    providerId: number,
  ): Promise<SsoProviderRecord | null> {
    const provider = await this.store.findByTypeAndId(ssoType, providerId);
    if (provider) {
      this.decryptProviderSecrets(provider);
    }
    return provider;
  }

  public async createProvider(createDto: CreateSSOProviderDto, actor: AuditActor): Promise<SsoProviderRecord> {
    // verifying usage limits
    await this.licenseService.verifyLicense({
      modules: [LicenseModuleType.SSO],
    });

    const draft = this.buildProviderDraft(createDto);
    // The store writes the provider, its configuration and the audit event in one unit.
    return this.store.create(draft, (created) => {
      this.decryptProviderSecrets(created);
      return ssoProviderAuditEvent('created', actor, created);
    });
  }

  public async updateProvider(
    id: number,
    updateDto: UpdateSSOProviderDto,
    actor: AuditActor,
  ): Promise<SsoProviderRecord> {
    await this.licenseService.verifyLicense({ modules: [LicenseModuleType.SSO] });
    const provider = await this.getProviderById(id);

    const updated = await this.store.update(
      id,
      (current) => this.planProviderUpdate(current, updateDto),
      (after) => {
        this.decryptProviderSecrets(after);
        return ssoProviderAuditEvent('updated', actor, after, provider);
      },
    );
    if (!updated) throw new BadRequestException('Provider not found after update');
    this.decryptProviderSecrets(updated);
    return updated;
  }

  public async deleteProvider(id: number, actor: AuditActor): Promise<void> {
    await this.licenseService.verifyLicense({ modules: [LicenseModuleType.SSO] });
    await this.getProviderById(id);
    await this.store.remove(id, (removed) => {
      this.decryptProviderSecrets(removed);
      return ssoProviderAuditEvent('deleted', actor, removed);
    });
  }

  protected buildProviderDraft(createDto: CreateSSOProviderDto): SsoProviderDraft {
    switch (createDto.type) {
      case SSOProviderType.OIDC:
        if (!createDto.oidcConfiguration) throw new BadRequestException('Missing OIDC configuration payload');
        return {
          name: createDto.name,
          type: createDto.type,
          oidcConfiguration: this.buildOidcConfiguration(createDto.oidcConfiguration),
        };
      case SSOProviderType.SAML:
        if (!createDto.samlConfiguration) throw new BadRequestException('Missing SAML configuration payload');
        return {
          name: createDto.name,
          type: createDto.type,
          samlConfiguration: this.buildSamlConfiguration(createDto.samlConfiguration),
        };
      default:
        throw new BadRequestException(`Unsupported SSO provider type: ${createDto.type}`);
    }
  }

  /** Derives the changes of an update from the provider as stored at that moment; may refuse the update. */
  protected planProviderUpdate(current: SsoProviderRecord, updateDto: UpdateSSOProviderDto): SsoProviderChanges {
    const changes: SsoProviderChanges = {};
    if (current.type === SSOProviderType.OIDC && updateDto.oidcConfiguration) {
      changes.oidcConfiguration = this.buildOidcChanges(updateDto.oidcConfiguration);
    }
    if (current.type === SSOProviderType.SAML && updateDto.samlConfiguration) {
      changes.samlConfiguration = this.buildSamlChanges(updateDto.samlConfiguration, current.samlConfiguration);
    }
    if (updateDto.name) changes.name = updateDto.name;
    return changes;
  }

  protected buildSamlConfiguration(config: CreateSAMLConfigurationDto): NewSsoSamlConfiguration {
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

    return {
      ...persistableConfig,
      emailAttributeKeys: emptyListToNull(persistableConfig.emailAttributeKeys),
      firstNameClaimPath: blankToNull(persistableConfig.firstNameClaimPath),
      lastNameClaimPath: blankToNull(persistableConfig.lastNameClaimPath),
      roleAttributeKeys: emptyListToNull(persistableConfig.roleAttributeKeys),
      certificate: normalizedCertificate,
      provisioningSecret: encryptedProvisioningSecret,
      spSigningCertificate: normalizedSpSigningCertificate,
      spSigningKeyEncrypted: encryptedPrivateKey,
      spSigningKeyEncryptionKeyId: encryptedPrivateKey ? this.getEncryptionKeyId() : null,
    } as NewSsoSamlConfiguration;
  }

  protected buildSamlChanges(
    config: UpdateSAMLConfigurationDto,
    existing: SsoSamlConfigurationRecord | undefined,
  ): SsoSamlConfigurationChanges {
    if (config.logoutURL) trustedEndpoint(config.logoutURL);
    if (!existing) {
      throw new BadRequestException('SAML configuration not found for provider');
    }

    const payload = this.buildSAMLConfigurationUpdate(config, existing);
    this.assertSAMLConfigurationUsable(config, payload, existing);
    return payload;
  }

  /** Copies provided fields; normalizes and encrypts the sensitive ones. Explicit null clears a column. */
  protected buildSAMLConfigurationUpdate(
    config: UpdateSAMLConfigurationDto,
    existing: SsoSamlConfigurationRecord,
  ): SsoSamlConfigurationChanges {
    const payload: SsoSamlConfigurationChanges = {};
    for (const key of SAML_UPDATE_PASSTHROUGH_FIELDS) {
      if (config[key] !== undefined) Object.assign(payload, { [key]: config[key] });
    }
    for (const key of ['emailAttributeKeys', 'roleAttributeKeys'] as const) {
      if (config[key] !== undefined) Object.assign(payload, { [key]: emptyListToNull(config[key]) });
    }
    for (const key of ['firstNameClaimPath', 'lastNameClaimPath'] as const) {
      if (config[key] !== undefined) Object.assign(payload, { [key]: blankToNull(config[key]) });
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
    existing: SsoSamlConfigurationRecord,
  ): SsoSamlConfigurationChanges {
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
    payload: SsoSamlConfigurationChanges,
    existing: SsoSamlConfigurationRecord,
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

  protected buildOidcConfiguration(config: CreateOIDCConfigurationDto): NewSsoOidcConfiguration {
    this.validateOidcLogoutConfig(config);
    const encryptedSecret = this.encryptionService.encrypt(config.clientSecret);
    return {
      ...config,
      scopes: emptyListToNull(config.scopes),
      usernameClaimPaths: emptyListToNull(config.usernameClaimPaths),
      emailClaimPaths: emptyListToNull(config.emailClaimPaths),
      firstNameClaimPath: blankToNull(config.firstNameClaimPath),
      lastNameClaimPath: blankToNull(config.lastNameClaimPath),
      roleClaimPaths: emptyListToNull(config.roleClaimPaths),
      clientSecret: encryptedSecret,
    } as NewSsoOidcConfiguration;
  }

  protected buildOidcChanges(updateConfig: UpdateOIDCConfigurationDto): SsoOidcConfigurationChanges {
    this.validateOidcLogoutConfig(updateConfig);
    const payload: SsoOidcConfigurationChanges = {};
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
      payload.scopes = emptyListToNull(updateConfig.scopes);
    }
    if (typeof updateConfig.usernameClaimPaths !== 'undefined') {
      payload.usernameClaimPaths = emptyListToNull(updateConfig.usernameClaimPaths);
    }
    if (typeof updateConfig.emailClaimPaths !== 'undefined') {
      payload.emailClaimPaths = emptyListToNull(updateConfig.emailClaimPaths);
    }
    for (const key of ['firstNameClaimPath', 'lastNameClaimPath'] as const) {
      if (typeof updateConfig[key] !== 'undefined') payload[key] = blankToNull(updateConfig[key]);
    }
    if (typeof updateConfig.roleClaimPaths !== 'undefined') {
      // explicit null clears the column
      payload.roleClaimPaths = emptyListToNull(updateConfig.roleClaimPaths);
    }
    if (typeof updateConfig.roleMappings !== 'undefined') {
      // explicit null clears the column
      payload.roleMappings = updateConfig.roleMappings;
    }
    if (typeof updateConfig.permissionSyncTtlMinutes !== 'undefined') {
      // explicit null falls back to the global default
      payload.permissionSyncTtlMinutes = updateConfig.permissionSyncTtlMinutes;
    }

    return payload;
  }

  /**
   * Decrypts provider secrets in place for use in the app. Assumes stored values
   * are already encrypted (see migration EncryptSensitiveData).
   */
  protected decryptProviderSecrets(provider?: SsoProviderRecord | null): void {
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
