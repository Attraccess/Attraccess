import {
  ProjectUsagePersistence,
  ProjectReportWindow,
  ProjectUsageAggregates,
  UsageSummaryRaw,
  ResourceUsageAggregateRaw,
  TimeSeriesUsageRaw,
  SpendRaw,
  ResourceSpendAggregateRaw,
  TimeSeriesSpendRaw,
} from './port';
import {
  BillingTransaction,
  BillingTransactionStatus,
  Setting,
  Project,
  ProjectInvitation,
  ProjectInvitationStatus,
  ProjectMember,
  ProjectMemberRole,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository, SelectQueryBuilder } from 'typeorm';
import { toApplicationRecord } from '../../database/sqlite/backend';
import { ProjectAccessPersistence, ProjectDeleteMissing, ProjectPersistence } from './port';

@Injectable()
export class TypeormProjectAccessPersistence extends ProjectAccessPersistence {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
  ) {
    super();
  }
  async ownedProject(userId: number, projectId: number): Promise<Project | null> {
    return toApplicationRecord(
      await this.projects.findOne({ where: { id: projectId, owner: { id: userId } }, relations: { owner: true } }),
    );
  }
  async projectWithOwner(projectId: number): Promise<Project | null> {
    return toApplicationRecord(await this.projects.findOne({ where: { id: projectId }, relations: { owner: true } }));
  }
  async membership(userId: number, projectId: number): Promise<ProjectMember | null> {
    return toApplicationRecord(
      await this.members.findOne({ where: { project: { id: projectId }, user: { id: userId } } }),
    );
  }
  async memberships(userId: number, projectIds: readonly number[]): Promise<ProjectMember[]> {
    if (!projectIds.length) return [];
    return toApplicationRecord(
      await this.members.find({ where: { user: { id: userId }, project: { id: In([...projectIds]) } } }),
    );
  }
}

@Injectable()
export class TypeormProjectPersistence extends ProjectPersistence {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(ProjectMember) private readonly memberRows: Repository<ProjectMember>,
    @InjectRepository(ProjectInvitation) private readonly invitations: Repository<ProjectInvitation>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super();
  }
  async accessiblePage(userId: number, page: number, limit: number, includeArchived: boolean): Promise<Project[]> {
    const query = this.projects
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.owner', 'owner')
      .leftJoin('project.members', 'member', 'member.userId = :userId', { userId })
      .where('(owner.id = :userId OR member.id IS NOT NULL)', { userId });
    if (!includeArchived) query.andWhere('project.archivedAt IS NULL');
    return toApplicationRecord(
      await query
        .orderBy('project.name', 'ASC')
        .addOrderBy('project.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getMany(),
    );
  }
  accessibleCount(userId: number, includeArchived: boolean): Promise<number> {
    const query = this.projects
      .createQueryBuilder('project')
      .leftJoin('project.owner', 'owner')
      .leftJoin('project.members', 'member', 'member.userId = :userId', { userId })
      .where('(owner.id = :userId OR member.id IS NOT NULL)', { userId });
    if (!includeArchived) query.andWhere('project.archivedAt IS NULL');
    return query.getCount();
  }
  async setArchived(id: number, archivedAt: Date | null): Promise<boolean> {
    return (
      (await this.projects.update({ id, archivedAt: archivedAt === null ? Not(IsNull()) : IsNull() }, { archivedAt }))
        .affected === 1
    );
  }
  async requireProject(id: number): Promise<Project> {
    return toApplicationRecord(await this.projects.findOneByOrFail({ id }));
  }
  async members(projectId: number): Promise<ProjectMember[]> {
    return toApplicationRecord(
      await this.memberRows.find({
        where: { project: { id: projectId } },
        relations: { user: true },
        order: { joinedAt: 'ASC' },
      }),
    );
  }
  async member(projectId: number, memberId: number): Promise<ProjectMember | null> {
    return toApplicationRecord(await this.memberRows.findOne({ where: { id: memberId, project: { id: projectId } } }));
  }
  async membership(projectId: number, userId: number): Promise<ProjectMember | null> {
    return toApplicationRecord(
      await this.memberRows.findOne({ where: { project: { id: projectId }, user: { id: userId } } }),
    );
  }
  async removeMember(id: number): Promise<boolean> {
    return (await this.memberRows.delete(id)).affected === 1;
  }
  async addMember(projectId: number, userId: number, role: ProjectMemberRole): Promise<ProjectMember> {
    return toApplicationRecord(await this.memberRows.save({ project: { id: projectId }, user: { id: userId }, role }));
  }
  async projectInvitations(projectId: number): Promise<ProjectInvitation[]> {
    return toApplicationRecord(
      await this.invitations.find({
        where: { project: { id: projectId } },
        relations: { invitedUser: true, inviter: true, project: { owner: true } },
        order: { createdAt: 'DESC' },
      }),
    );
  }
  async pendingInvitations(userId: number): Promise<ProjectInvitation[]> {
    return toApplicationRecord(
      await this.invitations.find({
        where: { invitedUser: { id: userId }, status: ProjectInvitationStatus.PENDING },
        relations: { invitedUser: true, inviter: true, project: { owner: true } },
        order: { createdAt: 'DESC' },
      }),
    );
  }
  async pendingInvitation(projectId: number, userId: number): Promise<ProjectInvitation | null> {
    return toApplicationRecord(
      await this.invitations.findOne({
        where: { project: { id: projectId }, invitedUser: { id: userId }, status: ProjectInvitationStatus.PENDING },
      }),
    );
  }
  async invitationWithRelations(id: number): Promise<ProjectInvitation | null> {
    return toApplicationRecord(
      await this.invitations.findOne({
        where: { id },
        relations: { invitedUser: true, inviter: true, project: { owner: true } },
      }),
    );
  }
  async saveInvitation(invitation: ProjectInvitation): Promise<void> {
    await this.invitations.save(invitation);
  }
  async invite(
    projectId: number,
    ownerId: number,
    invitedUserId: number,
    role: ProjectMemberRole,
  ): Promise<ProjectInvitation> {
    return toApplicationRecord(
      await this.invitations.save({
        project: { id: projectId },
        inviter: { id: ownerId },
        invitedUser: { id: invitedUserId },
        status: ProjectInvitationStatus.PENDING,
        requestedRole: role,
      }),
    );
  }
  async findUser(id: number): Promise<User | null> {
    return toApplicationRecord(await this.users.findOne({ where: { id } }));
  }
  async createProject(ownerId: number, name: string, description: string): Promise<Project> {
    return toApplicationRecord(await this.projects.save({ owner: { id: ownerId }, name, description }));
  }
  async saveProject(project: Project): Promise<Project> {
    return toApplicationRecord(await this.projects.save(project));
  }
  async deleteWithUsageDetachment(id: number): Promise<void> {
    await this.projects.manager.transaction(async (manager) => {
      await manager.getRepository(ResourceUsage).update({ projectId: id }, { projectId: null });
      if ((await manager.getRepository(Project).delete(id)).affected !== 1) throw new ProjectDeleteMissing();
    });
  }
}

@Injectable()
export class TypeormProjectUsagePersistence extends ProjectUsagePersistence {
  constructor(
    @InjectRepository(ResourceUsage) private readonly usages: Repository<ResourceUsage>,
    @InjectRepository(BillingTransaction) private readonly transactions: Repository<BillingTransaction>,
    @InjectRepository(Setting) private readonly settings: Repository<Setting>,
  ) {
    super();
  }
  private applyDateFilters<T>(query: SelectQueryBuilder<T>, alias: string, startDate?: Date, endDate?: Date): void {
    if (startDate) query.andWhere(`${alias}.startTime >= :startDate`, { startDate });
    if (endDate) query.andWhere(`${alias}.startTime <= :endDate`, { endDate });
  }
  async historyPage(
    projectId: number,
    page: number,
    limit: number,
    window: ProjectReportWindow,
  ): Promise<[ResourceUsage[], number]> {
    const query = this.usages
      .createQueryBuilder('usage')
      .leftJoinAndSelect('usage.user', 'user')
      .leftJoinAndSelect('usage.resource', 'resource')
      .leftJoinAndSelect('usage.project', 'project')
      .where('usage.projectId = :projectId', { projectId })
      .andWhere('usage.lifecyclePending = FALSE')
      .orderBy('usage.startTime', 'DESC');
    this.applyDateFilters(query, 'usage', window.startDate, window.endDate);
    return toApplicationRecord(
      await query
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount(),
    );
  }
  async statistics(projectId: number, window: ProjectReportWindow): Promise<ProjectUsageAggregates> {
    const completedUsageQb = this.usages
      .createQueryBuilder('usage')
      .leftJoin('usage.resource', 'resource')
      .where('usage.projectId = :projectId', { projectId })
      .andWhere('usage.endTime IS NOT NULL');

    this.applyDateFilters(completedUsageQb, 'usage', window.startDate, window.endDate);

    const summaryRaw = (await completedUsageQb
      .clone()
      .select('COUNT(*)', 'totalSessions')
      .addSelect('COALESCE(SUM(usage.usageInMinutes), 0)', 'totalMinutes')
      .getRawOne()) as UsageSummaryRaw;

    const perResourceUsageRaw = (await completedUsageQb
      .clone()
      .select('usage.resourceId', 'resourceId')
      .addSelect('resource.name', 'resourceName')
      .addSelect('COUNT(*)', 'sessions')
      .addSelect('COALESCE(SUM(usage.usageInMinutes), 0)', 'minutes')
      .groupBy('usage.resourceId')
      .addGroupBy('resource.name')
      .orderBy('sessions', 'DESC')
      .addOrderBy('minutes', 'DESC')
      .limit(5)
      .getRawMany()) as ResourceUsageAggregateRaw[];

    const timeSeriesUsageRaw = (await completedUsageQb
      .clone()
      .select('DATE(usage.startTime)', 'usageDate')
      .addSelect('COUNT(*)', 'sessions')
      .addSelect('COALESCE(SUM(usage.usageInMinutes), 0)', 'minutes')
      .groupBy('usageDate')
      .orderBy('usageDate', 'ASC')
      .getRawMany()) as TimeSeriesUsageRaw[];

    const billingBaseQb = this.transactions
      .createQueryBuilder('tx')
      .innerJoin('tx.resourceUsage', 'usage')
      .where('usage.projectId = :projectId', { projectId })
      .andWhere('tx.status = :status', { status: BillingTransactionStatus.Completed });

    this.applyDateFilters(billingBaseQb, 'usage', window.startDate, window.endDate);

    const totalSpendRaw = (await billingBaseQb
      .clone()
      .select('COALESCE(SUM(CASE WHEN tx.amount < 0 THEN -tx.amount ELSE 0 END), 0)', 'totalSpend')
      .getRawOne()) as SpendRaw;

    const perResourceSpendRaw = (await billingBaseQb
      .clone()
      .select('usage.resourceId', 'resourceId')
      .addSelect('COALESCE(SUM(CASE WHEN tx.amount < 0 THEN -tx.amount ELSE 0 END), 0)', 'spend')
      .groupBy('usage.resourceId')
      .getRawMany()) as ResourceSpendAggregateRaw[];

    const timeSeriesSpendRaw = (await billingBaseQb
      .clone()
      .select('DATE(usage.startTime)', 'usageDate')
      .addSelect('COALESCE(SUM(CASE WHEN tx.amount < 0 THEN -tx.amount ELSE 0 END), 0)', 'spend')
      .groupBy('usageDate')
      .orderBy('usageDate', 'ASC')
      .getRawMany()) as TimeSeriesSpendRaw[];

    return {
      summaryRaw,
      perResourceUsageRaw,
      timeSeriesUsageRaw,
      totalSpendRaw,
      perResourceSpendRaw,
      timeSeriesSpendRaw,
    };
  }
  async billingCurrency(): Promise<string | null> {
    return (await this.settings.findOneBy({ parent: 'billing', key: 'currency' }))?.value ?? null;
  }
}
