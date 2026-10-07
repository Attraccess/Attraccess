import { AuthenticationDetail, ResourceUsage, Session, User } from '@attraccess/database-entities';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { EmailService } from '../../email/email.service';
import { TokenHashService } from '../../encryption/token-hash.service';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { LicenseService } from '../../license/license.service';
import { MetricsService } from '../../metrics/metrics.service';
import { RbacService } from '../rbac/rbac.service';
import { UserBulkCreationImplementation } from './user-bulk-creation';

@Injectable()
export class UsersService extends UserBulkCreationImplementation {
  protected readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    protected userRepository: Repository<User>,
    @InjectRepository(AuthenticationDetail)
    protected authenticationDetailRepository: Repository<AuthenticationDetail>,
    @InjectRepository(Session)
    protected sessionRepository: Repository<Session>,
    @InjectRepository(ResourceUsage)
    protected resourceUsageRepository: Repository<ResourceUsage>,
    protected licenseService: LicenseService,
    protected emailService: EmailService,
    protected dataSource: DataSource,
    protected readonly tokenHashService: TokenHashService,
    protected readonly metricsService: MetricsService,
    protected readonly rbacService: RbacService,
  ) {
    super();
  }

  async updateLocale(userId: number, locale: string): Promise<User> {
    const cleaned = locale.trim();
    if (!cleaned) {
      throw new BadRequestException('Locale cannot be empty');
    }

    const existing = await this.findOne({ id: userId });
    if (!existing) {
      throw new UserNotFoundException(userId);
    }
    const oldLocale = existing.locale ?? 'en';

    await this.userRepository.update(userId, { locale: cleaned });
    this.metricsService.usersLocaleSyncsTotal.inc({ locale: cleaned });
    this.metricsService.usersPerLocale.dec({ locale: oldLocale });
    this.metricsService.usersPerLocale.inc({ locale: cleaned });

    const updated = await this.findOne({ id: userId });
    if (!updated) {
      throw new UserNotFoundException(userId);
    }
    return updated;
  }

  async withTransaction<T>(handler: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(handler);
  }
}
