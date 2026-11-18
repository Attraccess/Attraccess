import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  AccessibleProjectsQuery,
  ProjectDetailsUpdate,
  ProjectMemberRecord,
  ProjectRecord,
} from '@attraccess/application-models';
import { Project, ProjectMember, ResourceUsage } from '@attraccess/database-entities';
import { DataSource, In, IsNull, Not, Repository, SelectQueryBuilder } from 'typeorm';
import type { ProjectStore } from '../../../projects/project.port';
import { UNIT_OF_WORK, type TransactionScope, type UnitOfWork } from '../../unit-of-work';
import { managerFor } from '../transaction-scope';
import { toProjectMemberRecord, toProjectRecord } from './project-mapping';

@Injectable()
export class TypeOrmProjectStore implements ProjectStore {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async findWithOwner(projectId: number): Promise<ProjectRecord | null> {
    const project = await this.projects.findOne({ where: { id: projectId }, relations: { owner: true } });
    return project ? toProjectRecord(project) : null;
  }

  async findOwned(userId: number, projectId: number): Promise<ProjectRecord | null> {
    const project = await this.projects.findOne({
      where: { id: projectId, owner: { id: userId } },
      relations: { owner: true },
    });
    return project ? toProjectRecord(project) : null;
  }

  async findMembership(projectId: number, userId: number): Promise<ProjectMemberRecord | null> {
    const membership = await this.members.findOne({ where: { project: { id: projectId }, user: { id: userId } } });
    return membership ? toProjectMemberRecord(membership) : null;
  }

  async findMembershipsOfUser(userId: number, projectIds: number[]): Promise<ProjectMemberRecord[]> {
    const memberships = await this.members.find({
      where: { user: { id: userId }, project: { id: In(projectIds) } },
    });
    return memberships.map(toProjectMemberRecord);
  }

  async listAccessible(
    userId: number,
    query: AccessibleProjectsQuery & { page: number; limit: number },
  ): Promise<ProjectRecord[]> {
    const qb = this.projects.createQueryBuilder('project').leftJoinAndSelect('project.owner', 'owner');
    this.applyAccessibleProjectFilters(qb, userId, query);
    const projects = await qb
      .orderBy('project.name', 'ASC')
      .addOrderBy('project.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();
    return projects.map(toProjectRecord);
  }

  async countAccessible(userId: number, query: AccessibleProjectsQuery): Promise<number> {
    const qb = this.projects.createQueryBuilder('project').leftJoin('project.owner', 'owner');
    this.applyAccessibleProjectFilters(qb, userId, query);
    return await qb.getCount();
  }

  /** Restricts to projects the user owns or is a member of, excluding archived and non-matching ones. */
  private applyAccessibleProjectFilters(
    qb: SelectQueryBuilder<Project>,
    userId: number,
    query: AccessibleProjectsQuery,
  ): void {
    qb.leftJoin('project.members', 'member', 'member.userId = :userId', { userId }).where(
      '(owner.id = :userId OR member.id IS NOT NULL)',
      { userId },
    );

    if (query.includeArchived !== true) {
      qb.andWhere('project.archivedAt IS NULL');
    }

    const search = query.search?.trim();
    if (search) {
      const pattern = `%${search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
      qb.andWhere("LOWER(project.name) LIKE LOWER(:search) ESCAPE '\\'", { search: pattern });
    }
  }

  async create(project: { ownerId: number; name: string; description: string | null }): Promise<ProjectRecord> {
    const saved = await this.projects.save({
      owner: { id: project.ownerId },
      name: project.name,
      description: project.description,
    });
    return toProjectRecord(await this.projects.findOneOrFail({ where: { id: saved.id }, relations: { owner: true } }));
  }

  async updateDetails(projectId: number, details: ProjectDetailsUpdate): Promise<ProjectRecord> {
    await this.projects.save({ id: projectId, ...details });
    return toProjectRecord(await this.projects.findOneOrFail({ where: { id: projectId }, relations: { owner: true } }));
  }

  async archive(projectId: number, archivedAt: Date): Promise<boolean> {
    const result = await this.projects.update({ id: projectId, archivedAt: IsNull() }, { archivedAt });
    return result.affected === 1;
  }

  async unarchive(projectId: number): Promise<boolean> {
    const result = await this.projects.update({ id: projectId, archivedAt: Not(IsNull()) }, { archivedAt: null });
    return result.affected === 1;
  }

  async getById(projectId: number): Promise<ProjectRecord> {
    return toProjectRecord(await this.projects.findOneByOrFail({ id: projectId }));
  }

  async deleteProject(projectId: number, scope: TransactionScope): Promise<boolean> {
    const manager = managerFor(this.dataSource(), this.uow, scope);
    await manager.getRepository(ResourceUsage).update({ projectId }, { projectId: null });
    const result = await manager.getRepository(Project).delete(projectId);
    return result.affected === 1;
  }

  async listMembers(projectId: number): Promise<ProjectMemberRecord[]> {
    const members = await this.members.find({
      where: { project: { id: projectId } },
      relations: { user: true },
      order: { joinedAt: 'ASC' },
    });
    return members.map(toProjectMemberRecord);
  }

  async findMember(projectId: number, memberId: number): Promise<ProjectMemberRecord | null> {
    const member = await this.members.findOne({ where: { id: memberId, project: { id: projectId } } });
    return member ? toProjectMemberRecord(member) : null;
  }

  async removeMember(memberId: number): Promise<boolean> {
    const result = await this.members.delete(memberId);
    return result.affected === 1;
  }

  private dataSource(): DataSource {
    return this.projects.manager.connection;
  }
}
