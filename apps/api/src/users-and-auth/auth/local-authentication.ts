import { AuthenticationDetail, AuthenticationType, User } from '@attraccess/database-entities';
import { NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { EntityManager } from 'typeorm';
import { AuthenticationOptions } from './auth.service.feature-definitions';
import { AuthServiceRouteContext } from './auth.service.route-context';
import { LocalLoginForSSOForbiddenException } from './errors/localLoginForSSOForbidden.exception';
import { UserEmailNotVerifiedException } from './errors/userEmailNotVerified.exception';
export abstract class LocalAuthenticationImplementation extends AuthServiceRouteContext {
  protected async getAuthenticationDetail(
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

  async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, this.SALT_ROUNDS);
  }

  async addAuthenticationDetails(
    userId: number,
    options: AuthenticationOptions,
    manager?: EntityManager,
    hashedPassword?: string,
  ): Promise<AuthenticationDetail> {
    const authenticationDetail = new AuthenticationDetail();
    authenticationDetail.userId = userId;
    authenticationDetail.type = options.type;

    if (options.type === AuthenticationType.LOCAL_PASSWORD) {
      this.logger.debug(`Adding local password authentication for user ID: ${userId}`);
      authenticationDetail.password = hashedPassword ?? (await this.hashPassword(options.details.password));
    } else if (options.type === AuthenticationType.SSO) {
      authenticationDetail.providerType = options.details.providerType;
      authenticationDetail.providerId = options.details.providerId;
      authenticationDetail.ssoSubject = options.details.subject;
    }

    const saved = manager
      ? await manager.save(authenticationDetail)
      : await this.authenticationDetailRepository.save(authenticationDetail);
    return saved;
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
    const method = options.type === AuthenticationType.LOCAL_PASSWORD ? 'local' : 'sso';

    const user = await this.usersService.findOne({ username });

    if (!user) {
      this.logger.debug(`No user found with username: ${username}`);
      // Unknown usernames are the dominant brute-force / credential-stuffing
      // vector, so they must be counted as failed logins for the alert to fire.
      this.metricsService.authLoginTotal.inc({ method, status: 'fail' });
      return null;
    }

    if (!user.isEmailVerified) {
      this.logger.debug(`User ${user.id} email not verified`);
      throw new UserEmailNotVerifiedException();
    }

    const isValid = await this.validateAuthenticationDetails(user.id, options);
    if (!isValid) {
      this.logger.debug(`Invalid authentication for user ID: ${user.id}`);
      this.metricsService.authLoginTotal.inc({ method, status: 'fail' });
      return null;
    }

    this.metricsService.authLoginTotal.inc({ method, status: 'success' });
    return user;
  }
}
