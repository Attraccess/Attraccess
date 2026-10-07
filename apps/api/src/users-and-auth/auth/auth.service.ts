import { AuthenticationDetail, AuthenticationType, SSOProviderType } from '@attraccess/database-entities';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailService } from '../../email/email.service';
import { TokenHashService } from '../../encryption/token-hash.service';
import { MetricsService } from '../../metrics/metrics.service';
import { UsersService } from '../users/users.service';
import { PasswordResetImplementation } from './password-reset';

@Injectable()
export class AuthService extends PasswordResetImplementation {
  protected readonly SALT_ROUNDS = 10;
  protected readonly logger = new Logger(AuthService.name);

  constructor(
    protected emailService: EmailService,
    @InjectRepository(AuthenticationDetail)
    protected authenticationDetailRepository: Repository<AuthenticationDetail>,
    protected usersService: UsersService,
    protected readonly tokenHashService: TokenHashService,
    protected readonly metricsService: MetricsService,
  ) {
    super();
    this.logger.debug('AuthService initialized');
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
}

export {
  AuthenticationOptions,
  LocalPasswordAuthenticationOptions,
  SSOAuthenticationOptions,
} from './auth.service.feature-definitions';
