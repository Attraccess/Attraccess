import { SSOProviderSAMLConfiguration } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { DeepPartial } from 'typeorm';
import { CreateSAMLConfigurationDto } from './dto/create-sso-provider.dto';
import { UpdateSAMLConfigurationDto } from './dto/update-sso-provider.dto';
import { SsoOidcConfigurationImplementation } from './sso-oidc-configuration';
export abstract class SsoSamlConfigurationImplementation extends SsoOidcConfigurationImplementation {
  protected async createSAMLConfiguration(
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

  protected async updateSAMLConfiguration(
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
        const canonicalPrivateKey = this.canonicalizePrivateKey(config.spSigningPrivateKey);
        const existingPrivateKey = existing.spSigningKeyEncrypted
          ? this.encryptionService.decryptIfEncrypted(existing.spSigningKeyEncrypted)
          : null;
        if (canonicalPrivateKey !== (existingPrivateKey ? this.canonicalizePrivateKey(existingPrivateKey) : null)) {
          payload.spSigningKeyEncrypted = this.encryptionService.encrypt(canonicalPrivateKey);
          payload.spSigningKeyEncryptionKeyId = this.getEncryptionKeyId();
        }
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
}
