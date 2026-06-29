import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import {
  Strategy,
  Profile as SamlProfile,
  PassportSamlConfig,
  MultiSamlStrategy,
} from '@node-saml/passport-saml';
import { ModuleRef } from '@nestjs/core';
import { UsersService } from '../../../users/users.service';
import { SSOProviderSAMLConfiguration, SSOProviderType, User } from '@attraccess/database-entities';
import { AccountLinkingRequiredException } from '../oidc/exceptions/account-linking-required.exception';
import { EncryptionService } from '../../../../encryption/encryption.service';
import { SSOSamlRequest, SSOSamlRequestOptions } from './saml.types';
import { MetricsService } from '../../../../metrics/metrics.service';
import { classifySsoFailureReason, markSsoFailureMetricRecorded, recordSsoLoginFailure } from '../sso-metrics';
import { resolveRoleKeysFromSsoRoles } from '../permission-mapping';
import { RbacService } from '../../../rbac/rbac.service';

type StrategyCtor = new (...args: unknown[]) => Strategy;
type SamlOptionsCallback = (error: Error | null, samlOptions?: PassportSamlConfig) => void;

@Injectable()
export class SSOSamlStrategy extends PassportStrategy(MultiSamlStrategy as unknown as StrategyCtor, 'sso-saml') {
  private readonly logger = new Logger(SSOSamlStrategy.name);

  constructor(private readonly moduleRef: ModuleRef) {
    const bootstrapLogger = new Logger(SSOSamlStrategy.name);
    const getSamlOptions = (req: SSOSamlRequest, done: SamlOptionsCallback) => {
      const requestOptions = req?.ssoSamlOptions;
      if (!requestOptions?.samlConfiguration) {
        bootstrapLogger.warn('Missing SAML request options; ensure SSOSamlGuard runs before AuthGuard.');
        return done(new BadRequestException('Missing SAML configuration') as unknown as Error);
      }

      try {
        const samlOptions = SSOSamlStrategy.buildPassportConfig(moduleRef, requestOptions, bootstrapLogger);
        return done(null, samlOptions);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        bootstrapLogger.error(`Failed to build SAML options: ${reason}`);
        return done(error instanceof Error ? error : new Error(reason));
      }
    };

    super({
      passReqToCallback: true,
      getSamlOptions,
    } as unknown as PassportSamlConfig);
  }

  private recordFailure(error: unknown): void {
    try {
      const metricsService = this.moduleRef.get(MetricsService, { strict: false });
      recordSsoLoginFailure(metricsService, SSOProviderType.SAML, classifySsoFailureReason(error), this.logger);
      markSsoFailureMetricRecorded(error);
    } catch (metricsError) {
      this.logger.warn(
        `Failed to resolve MetricsService for SSO login failure metric: ${metricsError instanceof Error ? metricsError.message : String(metricsError)}`,
      );
    }
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

  private static buildPassportConfig(
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

  private resolveEmail(profile: SamlProfile, config: SSOProviderSAMLConfiguration): string | undefined {
    const baseCandidates = [
      'email',
      'mail',
      'Email',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
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

  async validate(req: SSOSamlRequest, profile: SamlProfile): Promise<User> {
    const requestOptions = req?.ssoSamlOptions;
    if (!requestOptions?.samlConfiguration) {
      this.logger.error('SAML configuration missing on request');
      const error = new BadRequestException('Missing SAML configuration');
      this.recordFailure(error);
      throw error;
    }

    const config = requestOptions.samlConfiguration;
    const providerId = requestOptions.providerId ?? config.ssoProviderId;
    const samlUserId = typeof profile?.nameID === 'string' ? profile.nameID : undefined;
    if (!samlUserId) {
      this.logger.error('No NameID found in SAML assertion');
      const error = new BadRequestException('No NameID found in SAML assertion');
      this.recordFailure(error);
      throw error;
    }

    const usersService = await this.moduleRef.get(UsersService);
    const email = this.resolveEmail(profile, config);

    if (!email) {
      this.logger.error('No email attribute could be resolved from the SAML assertion');
      const error = new BadRequestException('No email found in SAML assertion');
      this.recordFailure(error);
      throw error;
    }

    let user = await usersService.findOne({ externalIdentifier: samlUserId }).catch(() => null);
    if (user) {
      return await this.syncPermissionsFromClaims(user, profile, config);
    }

    user = await usersService.findOne({ email }, ['authenticationDetails']).catch(() => null);
    if (user) {
      if (user.authenticationDetails.length === 0) {
        const updated = await usersService.updateOne(user.id, { externalIdentifier: samlUserId });
        return await this.syncPermissionsFromClaims(updated, profile, config, usersService);
      }

      const error = new AccountLinkingRequiredException({
        email,
        externalId: samlUserId,
        providerId,
        providerType: SSOProviderType.SAML,
      });
      throw error;
    }

    const rawUsername = this.resolveDisplayName(profile, email);
    const username = usersService.buildUsernameFromSSOClaim(rawUsername, email);
    user = await usersService
      .createOne({
        username,
        email,
        externalIdentifier: samlUserId,
        isEmailVerified: true,
      })
      .catch((error: Error) => {
        this.logger.error('Failed to create user after SAML authentication', error.stack);
        return null;
      });

    if (!user) {
      const error = new UnauthorizedException();
      this.recordFailure(error);
      throw error;
    }

    return await this.syncPermissionsFromClaims(user, profile, config);
  }

  private getPermissionClaimValues(profile: SamlProfile): unknown[] {
    const values: unknown[] = [];
    const profileRecord = profile as Record<string, unknown>;
    const attributes = profileRecord.attributes;
    if (attributes && typeof attributes === 'object') {
      values.push(...Object.values(attributes as Record<string, unknown>));
    }

    const candidateKeys = ['roles', 'role', 'groups', 'group'];
    for (const key of candidateKeys) {
      const value = profileRecord[key];
      if (value !== undefined && value !== null) {
        values.push(value);
      }
    }

    return values;
  }

  private resolveRoleNamesFromClaims(profile: SamlProfile): string[] {
    const roleNames: string[] = [];
    for (const value of this.getPermissionClaimValues(profile)) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === 'string') roleNames.push(entry);
        }
      } else if (typeof value === 'string') {
        roleNames.push(value);
      }
    }
    return roleNames;
  }

  private async syncPermissionsFromClaims(
    user: User,
    profile: SamlProfile,
    config: SSOProviderSAMLConfiguration,
  ): Promise<User> {
    const roleNames = this.resolveRoleNamesFromClaims(profile);
    const roleKeys = resolveRoleKeysFromSsoRoles(roleNames, config.permissionMappings);
    this.logger.debug(`RBAC role keys from SAML: ${JSON.stringify([...roleKeys])}`);

    const rbacService = this.moduleRef.get(RbacService, { strict: false });
    if (rbacService) {
      await rbacService.syncSsoRoles(
        user.id,
        [...roleKeys],
        SSOProviderType.SAML,
        config.ssoProviderId,
      );
    }
    return user;
  }
}
