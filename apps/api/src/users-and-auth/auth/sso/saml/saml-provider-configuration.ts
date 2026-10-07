import { SSOProviderSAMLConfiguration } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PassportSamlConfig, Profile as SamlProfile } from '@node-saml/passport-saml';
import { EncryptionService } from '../../../../encryption/encryption.service';
import { SSOSamlStrategy } from './saml.strategy';
import { SSOSamlStrategyRouteContext } from './saml.strategy.route-context';
import { SSOSamlRequestOptions } from './saml.types';
export abstract class SamlProviderConfigurationImplementation extends SSOSamlStrategyRouteContext {
  protected static toPem(cert: string): string {
    const sanitized = cert
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .trim();
    const chunked = sanitized.match(/.{1,64}/g)?.join('\n') ?? sanitized;
    return `-----BEGIN CERTIFICATE-----\n${chunked}\n-----END CERTIFICATE-----`;
  }

  protected static decryptSigningKey(
    moduleRef: ModuleRef,
    encrypted?: string | null,
    logger?: Logger,
  ): string | undefined {
    if (!encrypted) {
      return undefined;
    }

    try {
      const encryptionService = moduleRef.get(EncryptionService, { strict: false });
      if (!encryptionService) {
        logger?.error('EncryptionService is not available; cannot decrypt SAML signing key');
        return undefined;
      }
      return encryptionService.decrypt(encrypted);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      logger?.error(`Failed to decrypt SAML signing key: ${reason}`);
      return undefined;
    }
  }

  protected static buildPassportConfig(
    moduleRef: ModuleRef,
    requestOptions: SSOSamlRequestOptions,
    logger: Logger,
  ): PassportSamlConfig {
    const config = requestOptions.samlConfiguration;
    const signingPrivateKey = SSOSamlStrategy.decryptSigningKey(moduleRef, config.spSigningKeyEncrypted, logger);
    const signingCertificatePem = config.spSigningCertificate
      ? SSOSamlStrategy.toPem(config.spSigningCertificate)
      : undefined;

    if (config.signRequest && (!signingPrivateKey || !signingCertificatePem)) {
      logger.warn(
        'SAML request signing is enabled but signing materials are missing. AuthnRequests will be sent unsigned.',
      );
    }

    return {
      entryPoint: config.entryPoint,
      issuer: config.issuer,
      callbackUrl: requestOptions.callbackUrl,
      idpCert: SSOSamlStrategy.toPem(config.certificate),
      audience: config.audience ?? undefined,
      wantAssertionsSigned: config.wantAssertionsSigned,
      wantAuthnResponseSigned: config.wantAuthnResponseSigned,
      forceAuthn: config.forceAuthn,
      identifierFormat: null,
      disableRequestedAuthnContext: false,
      privateKey: signingPrivateKey,
    };
  }

  protected resolveEmail(profile: SamlProfile, config: SSOProviderSAMLConfiguration): string | undefined {
    const baseCandidates = [
      'email',
      'mail',
      'Email',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      'urn:oid:1.2.840.113549.1.9.1',
    ];
    const customCandidates = Array.isArray(config.emailAttributeKeys)
      ? config.emailAttributeKeys.filter(
          (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
        )
      : [];
    const candidates = [...customCandidates, ...baseCandidates];
    for (const key of candidates) {
      const raw = (profile as Record<string, unknown>)[key];
      if (typeof raw === 'string' && raw.trim().length > 0) {
        return raw;
      }
      if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
        return raw[0];
      }
    }
    if (Array.isArray((profile as unknown as { emails?: string[] }).emails)) {
      const [first] = (profile as unknown as { emails?: string[] }).emails ?? [];
      if (first) return first;
    }

    const attributes = (profile as Record<string, unknown>).attributes as Record<string, unknown> | undefined;
    if (attributes) {
      for (const key of candidates) {
        const attributeValue = attributes[key];
        if (typeof attributeValue === 'string' && attributeValue.trim().length > 0) {
          return attributeValue;
        }
        if (Array.isArray(attributeValue) && attributeValue.length > 0 && typeof attributeValue[0] === 'string') {
          return attributeValue[0];
        }
      }
    }

    this.logger.debug('No email attribute could be resolved from the SAML assertion', profile);
    return undefined;
  }

  protected resolveDisplayName(profile: SamlProfile, fallbackEmail: string): string {
    const candidates = ['displayName', 'cn', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name', 'name'];
    for (const key of candidates) {
      const value = (profile as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
    return fallbackEmail;
  }
}
