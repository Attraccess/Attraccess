import { AuthenticationDetail, AuthenticationType } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { EmailService } from '../../email/email.service';
import { TokenHashService } from '../../encryption/token-hash.service';
import { MetricsService } from '../../metrics/metrics.service';
import { UsersService } from '../users/users.service';
import { AuthenticationOptions } from './auth.service.feature-definitions';

export abstract class AuthServiceRouteContext {
  protected abstract authenticationDetailRepository: Repository<AuthenticationDetail>;
  protected abstract readonly logger: Logger;
  protected abstract getAuthenticationDetail(
    authenticationType: AuthenticationType,
    userId: number,
  ): Promise<AuthenticationDetail>;
  protected abstract usersService: UsersService;
  protected abstract readonly SALT_ROUNDS: 10;
  public abstract hashPassword(password: string): Promise<string>;
  public abstract removeAuthenticationDetails(authenticationDetailsId: number): Promise<void>;
  protected abstract readonly metricsService: MetricsService;
  public abstract validateAuthenticationDetails(userId: number, options: AuthenticationOptions): Promise<boolean>;
  protected abstract readonly tokenHashService: TokenHashService;
  public abstract addAuthenticationDetails(
    userId: number,
    options: AuthenticationOptions,
    manager?: EntityManager,
    hashedPassword?: string,
  ): Promise<AuthenticationDetail>;
  protected abstract emailService: EmailService;
}
