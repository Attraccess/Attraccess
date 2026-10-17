import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { User, Resource, Project, ResourceUsage, Session } from '@attraccess/database-entities';
import { activeUsageWhere } from '../../database/sqlite/usage-integrity';
import { VersionPersistence, SystemCounts } from './port';

@Injectable()
export class TypeormVersionPersistence extends VersionPersistence {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Resource) private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(Project) private readonly projectRepository: Repository<Project>,
    @InjectRepository(ResourceUsage) private readonly resourceUsageRepository: Repository<ResourceUsage>,
    @InjectRepository(Session) private readonly sessionRepository: Repository<Session>,
  ) {
    super();
  }

  async systemCounts(at: Date): Promise<SystemCounts> {
    const [usersTotal, resourcesTotal, projectsTotal, activeResourceUsageSessions, activeAuthSessions] =
      await Promise.all([
        this.userRepository.count(),
        this.resourceRepository.count(),
        this.projectRepository.count(),
        this.resourceUsageRepository.count({ where: activeUsageWhere() }),
        this.sessionRepository.count({ where: { expiresAt: MoreThan(at) } }),
      ]);
    return { usersTotal, resourcesTotal, projectsTotal, activeResourceUsageSessions, activeAuthSessions };
  }
}
