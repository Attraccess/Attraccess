import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { EntityManager, Repository } from 'typeorm';
import { User, AuthenticationDetail, AuthenticationType, SSOProviderType } from '@attraccess/database-entities';
import { InjectRepository } from '@nestjs/typeorm';
import { EmailService } from '../../email/email.service';
import { addDays } from 'date-fns';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LocalLoginForSSOForbiddenException } from './errors/localLoginForSSOForbidden.exception';
import { TokenHashService } from '../../encryption/token-hash.service';
import { MetricsService } from '../../metrics/metrics.service';

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

class UserEmailNotVerifiedException extends ForbiddenException {
  constructor() {
    super('UserEmailNotVerifiedException');
  }
}

class UserEmailInvalidVerificationTokenException extends UnauthorizedException {
  constructor() {
    super('UserEmailInvalidVerificationTokenException');
  }
}

class UserEmailVerificationTokenExpiredException extends UnauthorizedException {
  constructor() {
    super('UserEmailVerificationTokenExpiredException');
  }
}

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 10;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private emailService: EmailService,
    @InjectRepository(AuthenticationDetail)
    private authenticationDetailRepository: Repository<AuthenticationDetail>,
    private usersService: UsersService,
    private readonly tokenHashService: TokenHashService,
    private readonly metricsService: MetricsService,
  ) {
    this.logger.debug('AuthService initialized');
  }

  private async getAuthenticationDetail(
    authenticationType: AuthenticationType,
    userId: number,
  ): Promise<AuthenticationDetail> {
    const details = await this.authenticationDetailRepository.findOne({
      where: { userId, type: authenticationType },
    });

    if (!details) {
      this.logger.debug(`Authentication details not found for user ID: ${userId}`);
      throw new NotFoundException(`Authentication details for user ${userId} not found`);
    }

    return details;
  }

  async validateAuthenticationDetails(userId: number, options: AuthenticationOptions): Promise<boolean> {
    const authenticationDetails = await this.getAuthenticationDetail(options.type, userId).catch((error) => {
      if (error instanceof NotFoundException) {
        return null;
      }
      throw error;
    });

    if (!authenticationDetails) {
      this.logger.debug(`No authentication details of type ${options.type} found for user ID: ${userId}`);
      return false;
    }

    let isValid = false;
    switch (options.type) {
      case AuthenticationType.LOCAL_PASSWORD: {
        const isSSOUser = await this.usersService.isSSOUser(userId);
        if (isSSOUser) {
          throw new LocalLoginForSSOForbiddenException();
        }
        isValid = await bcrypt.compare(options.details.password, authenticationDetails.password || '');
        break;
      }

      case AuthenticationType.SSO: {
        isValid =
          authenticationDetails.providerType === options.details.providerType &&
          authenticationDetails.providerId === options.details.providerId &&
          authenticationDetails.ssoSubject === options.details.subject;
        break;
      }

      default: {
        const exhaustiveCheck: never = options;
        throw new Error(`Invalid authentication type: ${exhaustiveCheck}`);
      }
    }

    return isValid;
  }

  private async hashPassword(password: string) {
    return await bcrypt.hash(password, this.SALT_ROUNDS);
  }

  async addAuthenticationDetails(userId: number, options: AuthenticationOptions): Promise<AuthenticationDetail> {
    const authenticationDetail = new AuthenticationDetail();
    authenticationDetail.userId = userId;
    authenticationDetail.type = options.type;

    if (options.type === AuthenticationType.LOCAL_PASSWORD) {
      this.logger.debug(`Hashing password for user ID: ${userId}`);
      authenticationDetail.password = await this.hashPassword(options.details.password);
    } else if (options.type === AuthenticationType.SSO) {
      authenticationDetail.providerType = options.details.providerType;
      authenticationDetail.providerId = options.details.providerId;
      authenticationDetail.ssoSubject = options.details.subject;
    }

    const saved = await this.authenticationDetailRepository.save(authenticationDetail);
    return saved;
  }

  async findUserIdBySSO(providerType: SSOProviderType, providerId: number, subject: string): Promise<number | null> {
    const detail = await this.authenticationDetailRepository.findOne({
      where: {
        type: AuthenticationType.SSO,
        providerType,
        providerId,
        ssoSubject: subject,
      },
    });

    return detail?.userId ?? null;
  }

  async userHasSSOAuthentication(userId: number): Promise<boolean> {
    const count = await this.authenticationDetailRepository.count({
      where: { userId, type: AuthenticationType.SSO },
    });
    return count > 0;
  }

  async findSSOAuthenticationDetail(userId: number): Promise<AuthenticationDetail | null> {
    return this.authenticationDetailRepository.findOne({
      where: { userId, type: AuthenticationType.SSO },
    });
  }

  async updateSSOSubject(detailId: number, ssoSubject: string): Promise<void> {
    await this.authenticationDetailRepository.update(detailId, { ssoSubject });
  }

  async removeLocalPasswordAuthentication(userId: number): Promise<void> {
    const detail = await this.authenticationDetailRepository.findOne({
      where: { userId, type: AuthenticationType.LOCAL_PASSWORD },
    });

    if (detail) {
      await this.removeAuthenticationDetails(detail.id);
    }
  }

  async removeAuthenticationDetails(authenticationDetailsId: number): Promise<void> {
    await this.authenticationDetailRepository.delete({
      id: authenticationDetailsId,
    });
  }

  async getUserByUsernameAndAuthenticationDetails(
    username: string,
    options: AuthenticationOptions,
  ): Promise<User | null> {
    const user = await this.usersService.findOne({ username });

    if (!user) {
      this.logger.debug(`No user found with username: ${username}`);
      return null;
    }

    if (!user.isEmailVerified) {
      this.logger.debug(`User ${user.id} email not verified`);
      throw new UserEmailNotVerifiedException();
    }

    const isValid = await this.validateAuthenticationDetails(user.id, options);
    if (!isValid) {
      this.logger.debug(`Invalid authentication for user ID: ${user.id}`);
      this.metricsService.authLoginTotal.inc({ method: options.type === AuthenticationType.LOCAL_PASSWORD ? 'local' : 'sso', status: 'fail' });
      return null;
    }

    this.metricsService.authLoginTotal.inc({ method: options.type === AuthenticationType.LOCAL_PASSWORD ? 'local' : 'sso', status: 'success' });
    return user;
  }

  async generateEmailVerificationToken(user: User, manager?: EntityManager): Promise<string> {
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
    await this.usersService.updateOne(user.id, {
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationTokenExpiresAt: null,
    });
    this.logger.debug(`Email successfully verified for user ID: ${user.id}`);
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

  async changePassword(user: User, password: string): Promise<void> {
    const isSSOUser = await this.usersService.isSSOUser(user.id);
    if (isSSOUser) {
      throw new ForbiddenException('You cannot change the password of an SSO user');
    }

    const authenticationDetail = await this.getAuthenticationDetail(AuthenticationType.LOCAL_PASSWORD, user.id).catch(
      (error) => {
        if (error instanceof NotFoundException) {
          return null;
        }
        throw error;
      },
    );

    if (authenticationDetail) {
      authenticationDetail.password = await this.hashPassword(password);
      await this.authenticationDetailRepository.save(authenticationDetail);
    } else {
      await this.addAuthenticationDetails(user.id, {
        type: AuthenticationType.LOCAL_PASSWORD,
        details: {
          password,
        },
      });
    }

    // Notify user about password change
    await this.emailService.sendPasswordChangedEmail(user);
  }
}
