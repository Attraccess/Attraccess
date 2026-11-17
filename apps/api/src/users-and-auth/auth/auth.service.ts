import {
  AuthenticationType,
  SSOProviderType,
  type AuthenticatedSessionUser,
  type CredentialRecord,
  type NotificationRecipient,
  type SsoCredentialRecord,
} from '@attraccess/application-models';

import { Inject, Injectable, Logger, ForbiddenException, UnauthorizedException } from '@nestjs/common';

import type { TransactionContext } from '../../database/transaction-context';

import { EmailService } from '../../email/email.service';

import { TokenHashService } from '../../encryption/token-hash.service';

import { MetricsService } from '../../metrics/metrics.service';

import { UsersService } from '../users/users.service';

import { PasswordPolicyService } from '../password-policy/password-policy.service';

import { CREDENTIAL_STORE, CredentialStore } from './credentials/credential-store.port';

import { randomBytes } from 'crypto';

import { addDays } from 'date-fns';
import * as bcrypt from 'bcrypt';

import { LocalLoginForSSOForbiddenException } from './errors/localLoginForSSOForbidden.exception';

import { UserEmailNotVerifiedException } from './errors/userEmailNotVerified.exception';

export interface LocalPasswordAuthenticationOptions {
  password: string;
}

export interface SSOAuthenticationOptions {
  providerType: SSOProviderType;
  providerId: number;
  subject: string;
}

export type AuthenticationOptions =
  | {
      type: AuthenticationType.LOCAL_PASSWORD;
      details: LocalPasswordAuthenticationOptions;
    }
  | {
      type: AuthenticationType.SSO;
      details: SSOAuthenticationOptions;
    };

export class UserEmailInvalidVerificationTokenException extends UnauthorizedException {
  constructor() {
    super('UserEmailInvalidVerificationTokenException');
  }
}

export class UserEmailVerificationTokenExpiredException extends UnauthorizedException {
  constructor() {
    super('UserEmailVerificationTokenExpiredException');
  }
}

@Injectable()
export class AuthService {
  constructor(
    protected emailService: EmailService,
    @Inject(CREDENTIAL_STORE) protected readonly credentials: CredentialStore,
    protected usersService: UsersService,
    protected readonly tokenHashService: TokenHashService,
    protected readonly metricsService: MetricsService,
    protected readonly passwordPolicy: PasswordPolicyService,
  ) {
    this.logger.debug('AuthService initialized');
  }

  protected readonly SALT_ROUNDS = 10;

  protected readonly logger = new Logger(AuthService.name);

  async findUserIdBySSO(providerType: SSOProviderType, providerId: number, subject: string): Promise<number | null> {
    return this.credentials.findUserIdBySso(providerType, providerId, subject);
  }

  async userHasSSOAuthentication(userId: number): Promise<boolean> {
    return (await this.credentials.findSso(userId)) !== null;
  }

  async findSSOAuthenticationDetail(userId: number): Promise<SsoCredentialRecord | null> {
    return this.credentials.findSso(userId);
  }

  async updateSSOSubject(detailId: number, ssoSubject: string): Promise<void> {
    await this.credentials.updateSsoSubject(detailId, ssoSubject);
  }

  async generatePasswordResetToken(email: string): Promise<string> {
    const user = await this.usersService.findOne({ email });
    if (!user) {
      this.logger.debug(`No user found with email: ${email}`);
      return null;
    }

    const token = randomBytes(16).toString('base64url').slice(0, 21);
    const storedToken = this.tokenHashService.hashToken(token);
    await this.usersService.updateOne(user.id, {
      passwordResetToken: storedToken,
      passwordResetTokenExpiresAt: addDays(new Date(), 1),
    });

    return token;
  }

  async changePassword(user: NotificationRecipient, password: string): Promise<void> {
    const isSSOUser = await this.usersService.isSSOUser(user.id);
    if (isSSOUser) {
      throw new ForbiddenException('You cannot change the password of an SSO user');
    }

    // Hashing is slow and needs no transaction. The change and the archiving of the replaced password happen
    // atomically in the store.
    const passwordHash = await this.hashPassword(password);
    const { historySize } = await this.passwordPolicy.getPolicy();
    await this.credentials.replaceLocalPassword(user.id, passwordHash, { rememberPrevious: historySize });

    // Notify user about password change
    await this.emailService.sendPasswordChangedEmail(user);
  }

  async generateEmailVerificationToken(user: { id: number }, manager?: TransactionContext): Promise<string> {
    const token = randomBytes(16).toString('base64url').slice(0, 21);
    const storedToken = this.tokenHashService.hashToken(token);

    this.logger.debug(`Setting email verification token for user ID: ${user.id}`);
    await this.usersService.updateOne(
      user.id,
      {
        emailVerificationToken: storedToken,
        emailVerificationTokenExpiresAt: addDays(new Date(), 3),
      },
      manager,
    );

    this.logger.debug(`Email verification token set for user ID: ${user.id}`);
    return token;
  }

  async verifyEmail(email: string, token: string): Promise<void> {
    this.logger.debug(`Verifying email: ${email} with token: ${token.substring(0, 5)}...`);
    const user = await this.usersService.findOne({ email });

    if (!user) {
      this.logger.debug(`No user found with email: ${email}`);
      throw new UserEmailInvalidVerificationTokenException();
    }

    const expected = this.tokenHashService.hashToken(token);
    if (user.emailVerificationToken !== expected && user.emailVerificationToken !== token) {
      this.logger.debug(`Invalid verification token for user ID: ${user.id}`);
      throw new UserEmailInvalidVerificationTokenException();
    }

    if (user.emailVerificationTokenExpiresAt < new Date()) {
      this.logger.debug(`Expired verification token for user ID: ${user.id}`);
      throw new UserEmailVerificationTokenExpiredException();
    }

    this.logger.debug(`Marking email as verified for user ID: ${user.id}`);
    // Exactly one of any number of concurrent requests with the same token gets to consume it.
    if (!(await this.usersService.consumeEmailVerificationToken(user.id, user.emailVerificationToken))) {
      this.logger.debug(`Verification token of user ID ${user.id} was already consumed`);
      throw new UserEmailInvalidVerificationTokenException();
    }
    this.logger.debug(`Email successfully verified for user ID: ${user.id}`);
  }

  async validateAuthenticationDetails(userId: number, options: AuthenticationOptions): Promise<boolean> {
    let isValid: boolean;
    switch (options.type) {
      case AuthenticationType.LOCAL_PASSWORD: {
        const passwordHash = await this.credentials.findLocalPasswordHash(userId);
        if (passwordHash === null) {
          this.logger.debug(`No authentication details of type ${options.type} found for user ID: ${userId}`);
          return false;
        }
        const isSSOUser = await this.usersService.isSSOUser(userId);
        if (isSSOUser) {
          throw new LocalLoginForSSOForbiddenException();
        }
        isValid = await bcrypt.compare(options.details.password, passwordHash);
        break;
      }

      case AuthenticationType.SSO: {
        const sso = await this.credentials.findSso(userId);
        if (!sso) {
          this.logger.debug(`No authentication details of type ${options.type} found for user ID: ${userId}`);
          return false;
        }
        isValid =
          sso.providerType === options.details.providerType &&
          sso.providerId === options.details.providerId &&
          sso.ssoSubject === options.details.subject;
        break;
      }

      default: {
        const exhaustiveCheck: never = options;
        throw new Error(`Invalid authentication type: ${exhaustiveCheck}`);
      }
    }

    return isValid;
  }

  async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, this.SALT_ROUNDS);
  }

  async addAuthenticationDetails(
    userId: number,
    options: AuthenticationOptions,
    manager?: TransactionContext,
    hashedPassword?: string,
  ): Promise<CredentialRecord> {
    if (options.type === AuthenticationType.LOCAL_PASSWORD) {
      this.logger.debug(`Adding local password authentication for user ID: ${userId}`);
      const passwordHash = hashedPassword ?? (await this.hashPassword(options.details.password));
      return this.credentials.add(userId, { type: AuthenticationType.LOCAL_PASSWORD, passwordHash }, manager);
    }
    return this.credentials.add(
      userId,
      {
        type: AuthenticationType.SSO,
        providerType: options.details.providerType,
        providerId: options.details.providerId,
        subject: options.details.subject,
      },
      manager,
    );
  }

  async removeLocalPasswordAuthentication(userId: number): Promise<void> {
    await this.credentials.removeLocalPassword(userId);
  }

  async removeAuthenticationDetails(authenticationDetailsId: number): Promise<void> {
    await this.credentials.remove(authenticationDetailsId);
  }

  async getUserByLoginIdentifierAndAuthenticationDetails(
    identifier: string,
    options: AuthenticationOptions,
  ): Promise<AuthenticatedSessionUser | null> {
    const method = options.type === AuthenticationType.LOCAL_PASSWORD ? 'local' : 'sso';

    const user = await this.usersService.findByLoginIdentifier(identifier);

    if (!user) {
      this.logger.debug('No user found for login identifier');
      // Unknown usernames are the dominant brute-force / credential-stuffing
      // vector, so they must be counted as failed logins for the alert to fire.
      this.metricsService.authLoginTotal.inc({ method, status: 'fail' });
      return null;
    }

    const isValid = await this.validateAuthenticationDetails(user.id, options);
    if (!isValid) {
      this.logger.debug(`Invalid authentication for user ID: ${user.id}`);
      this.metricsService.authLoginTotal.inc({ method, status: 'fail' });
      return null;
    }

    if (!user.isEmailVerified) {
      this.logger.debug(`User ${user.id} email not verified`);
      throw new UserEmailNotVerifiedException();
    }

    this.metricsService.authLoginTotal.inc({ method, status: 'success' });
    return user;
  }
}
