import { User } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { DataSource, EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { EmailService } from '../../email/email.service';
import { TokenHashService } from '../../encryption/token-hash.service';
import { LicenseService } from '../../license/license.service';
import { MetricsService } from '../../metrics/metrics.service';
import { RbacService } from '../rbac/rbac.service';
import { FindOneOptions, UserListOptions } from './users.service.feature-definitions';

export abstract class UsersServiceRouteContext {
  public abstract cleanupUsername(username: string): string;
  protected abstract normalizeUsernameCandidate(value: string): string;
  public abstract validateUsernameOrThrow(username: string): void;
  protected abstract userRepository: Repository<User>;
  protected abstract readonly logger: Logger;
  protected abstract licenseService: LicenseService;
  public abstract findOne(options: FindOneOptions, relations?: string[], manager?: EntityManager): Promise<User | null>;
  protected abstract readonly rbacService: RbacService;
  protected abstract dataSource: DataSource;
  public abstract recordCreatedUser(user: User): void;
  protected abstract readonly metricsService: MetricsService;
  protected abstract anonymizeAndSoftDelete(id: number, manager?: EntityManager): Promise<void>;
  public abstract isSSOUser(userId: number): Promise<boolean>;
  protected abstract emailService: EmailService;
  protected abstract isEmailUniqueConstraintViolation(error: unknown): boolean;
  protected abstract applyRoleFilters(query: SelectQueryBuilder<User>, options: UserListOptions): void;
  protected abstract applySsoFilters(query: SelectQueryBuilder<User>, options: UserListOptions): void;
  protected abstract readonly tokenHashService: TokenHashService;
}
