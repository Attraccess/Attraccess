import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Project, Resource, ResourceUsage, Session, User } from '@attraccess/database-entities';
import { MoreThan, Repository } from 'typeorm';
import { activeUsageWhere } from '../../../resources/usage/sessions/active-usage';
import type { SystemCounts, SystemStatsStore } from '../../../version/system-stats.port';

@Injectable()
export class TypeOrmSystemStatsStore implements SystemStatsStore {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(ResourceUsage) private readonly usages: Repository<ResourceUsage>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
  ) {}

  async readCounts(): Promise<SystemCounts> {
    const [usersTotal, resourcesTotal, projectsTotal, activeResourceUsageSessions, activeAuthSessions] =
      await Promise.all([
        this.users.count(),
        this.resources.count(),
        this.projects.count(),
        this.usages.count({ where: activeUsageWhere() }),
        this.sessions.count({ where: { expiresAt: MoreThan(new Date()) } }),
      ]);
    return { usersTotal, resourcesTotal, projectsTotal, activeResourceUsageSessions, activeAuthSessions };
  }
}
