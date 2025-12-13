import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile as SamlProfile, PassportSamlConfig } from '@node-saml/passport-saml';
import { ModuleRef } from '@nestjs/core';
import { UsersService } from '../../../users/users.service';
import { SSOProviderSAMLConfiguration, SSOProviderType, User } from '@attraccess/database-entities';
import { AccountLinkingRequiredException } from '../oidc/exceptions/account-linking-required.exception';
import { EncryptionService } from '../../../../encryption/encryption.service';

type StrategyCtor = new (options: PassportSamlConfig) => Strategy;

@Injectable()
export class SSOSamlStrategy extends PassportStrategy(Strategy as unknown as StrategyCtor, 'sso-saml') {
  private readonly logger = new Logger(SSOSamlStrategy.name);
  private readonly config: SSOProviderSAMLConfiguration;

  constructor(
    private readonly moduleRef: ModuleRef,
    config: SSOProviderSAMLConfiguration,
    callbackUrl: string,
  ) {
    const bootstrapLogger = new Logger(SSOSamlStrategy.name);
    const signingPrivateKey = SSOSamlStrategy.decryptSigningKey(
      moduleRef,
      config.spSigningKeyEncrypted,
      bootstrapLogger,
    );
    const signingCertificatePem = config.spSigningCertificate
      ? SSOSamlStrategy.toPem(config.spSigningCertificate)
      : undefined;

    super({
      entryPoint: config.entryPoint,
      issuer: config.issuer,
      callbackUrl,
      idpCert: SSOSamlStrategy.toPem(config.certificate),
      audience: config.audience ?? undefined,
      wantAssertionsSigned: config.wantAssertionsSigned,
      wantAuthnResponseSigned: config.wantAuthnResponseSigned,
      forceAuthn: config.forceAuthn,
      identifierFormat: null,
      disableRequestedAuthnContext: false,
      privateKey: signingPrivateKey,
    });

    this.config = config;

    if (config.signRequest && (!signingPrivateKey || !signingCertificatePem)) {
      this.logger.warn(
        'SAML request signing is enabled but signing materials are missing. AuthnRequests will be sent unsigned.',
      );
    }

    this.logger.log(`Initialized SAML strategy with issuer ${config.issuer} and callback ${callbackUrl}`);
  }

  private static toPem(cert: string): string {
    const sanitized = cert
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .trim();
    const chunked = sanitized.match(/.{1,64}/g)?.join('\n') ?? sanitized;
    return `-----BEGIN CERTIFICATE-----\n${chunked}\n-----END CERTIFICATE-----`;
  }

  private static decryptSigningKey(
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

  private resolveEmail(profile: SamlProfile): string | undefined {
    const baseCandidates = [
      'email',
      'mail',
      'Email',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
      'urn:oid:1.2.840.113549.1.9.1',
    ];
    const customCandidates = Array.isArray(this.config.emailAttributeKeys)
      ? this.config.emailAttributeKeys.filter(
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

  private resolveDisplayName(profile: SamlProfile, fallbackEmail: string): string {
    const candidates = ['displayName', 'cn', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name', 'name'];
    for (const key of candidates) {
      const value = (profile as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
    return fallbackEmail;
  }

  async validate(profile: SamlProfile): Promise<User> {
    const samlUserId = profile?.nameID;
    if (!samlUserId) {
      this.logger.error('No NameID found in SAML assertion');
      throw new BadRequestException('No NameID found in SAML assertion');
    }

    const usersService = await this.moduleRef.get(UsersService);
    const email = this.resolveEmail(profile);

    if (!email) {
      this.logger.error('No email attribute could be resolved from the SAML assertion');
      throw new BadRequestException('No email found in SAML assertion');
    }

    let user = await usersService.findOne({ externalIdentifier: samlUserId }).catch(() => null);
    if (user) {
      return user;
    }

    user = await usersService.findOne({ email }, ['authenticationDetails']).catch(() => null);
    if (user) {
      if (user.authenticationDetails.length === 0) {
        return await usersService.updateOne(user.id, { externalIdentifier: samlUserId });
      }

      throw new AccountLinkingRequiredException({
        email,
        externalId: samlUserId,
        providerId: this.config.ssoProviderId,
        providerType: SSOProviderType.SAML,
      });
    }

    const username = this.resolveDisplayName(profile, email);
    user = await usersService.createOne({ username, email, externalIdentifier: samlUserId }).catch((error: Error) => {
      this.logger.error('Failed to create user after SAML authentication', error.stack);
      return null;
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    return user;
  }
}
