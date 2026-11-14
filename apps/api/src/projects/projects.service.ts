import {
  Project,
  ProjectInvitation,
  ProjectMember,
  ProjectMemberRole,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';

import { Injectable, NotFoundException, Inject } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { IsNull, Not, Repository, SelectQueryBuilder } from 'typeorm';

import { AUDIT_RECORDER, AuditRecorder } from '../audit/recorder/audit-event';

import { FileStorageService } from '../common/services/file-storage.service';

import { EmailService } from '../email/email.service';

import { MetricsService } from '../metrics/metrics.service';

import { NotificationDispatchService } from '../notifications/notification-dispatch.service';

import { FindManyProjectsQueryDto } from './dto/find-many-query.dto';

import { ProjectWithAccessDto } from './dto/project-access.dto';

import { ProjectAccessService } from './project-access.service';

import { FileUpload } from '../common/types/file-upload.types';

import { CreateProjectDto } from './dto/create.dto';

import { UpdateProjectDto } from './dto/update.dto';

import { ProjectInvitations } from './invitations/project-invitations';

@Injectable()
export class ProjectsService {
  private readonly invitations: ProjectInvitations;

  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(ProjectMember)
    private readonly projectMemberRepository: Repository<ProjectMember>,
    @InjectRepository(ProjectInvitation)
    private readonly projectInvitationRepository: Repository<ProjectInvitation>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ResourceUsage)
    private readonly resourceUsageRepository: Repository<ResourceUsage>,
    private readonly fileStorageService: FileStorageService,
    private readonly projectAccessService: ProjectAccessService,
    private readonly emailService: EmailService,
    private readonly metricsService: MetricsService,
    private readonly notifications: NotificationDispatchService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {
    this.invitations = new ProjectInvitations(
      this.audit,
      this.projectAccessService,
      this.userRepository,
      this.projectMemberRepository,
      this.projectInvitationRepository,
      this.notifications,
      this.emailService,
    );
  }

  public async findMany(userId: number, query: FindManyProjectsQueryDto): Promise<ProjectWithAccessDto[]> {
    const { page, limit: take } = query;
    const skip = (page - 1) * take;

    const qb = this.projectRepository.createQueryBuilder('project').leftJoinAndSelect('project.owner', 'owner');
    this.applyAccessibleProjectFilters(qb, userId, query);

    const projects = await qb
      .orderBy('project.name', 'ASC')
      .addOrderBy('project.createdAt', 'DESC')
      .skip(skip)
      .take(take)
      .getMany();

    return this.projectAccessService.addAccessMetadata(userId, projects);
  }

  public async getTotalCount(
    userId: number,
    query: { includeArchived?: boolean; search?: string } = {},
  ): Promise<number> {
    const qb = this.projectRepository.createQueryBuilder('project').leftJoin('project.owner', 'owner');
    this.applyAccessibleProjectFilters(qb, userId, query);

    return await qb.getCount();
  }

  /** Restricts to projects the user owns or is a member of, excluding archived and non-matching ones. */
  private applyAccessibleProjectFilters(
    qb: SelectQueryBuilder<Project>,
    userId: number,
    query: { includeArchived?: boolean; search?: string },
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

  public async findOneById(userId: number, id: number): Promise<Project> {
    return this.projectAccessService.getAccessOrThrow(userId, id);
  }

  public async archiveOne(
    ownerUserId: number,
    id: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<Project> {
    const project = await this.projectAccessService.ensureOwner(ownerUserId, id);
    const archivedAt = new Date();
    const result = await this.projectRepository.update({ id, archivedAt: IsNull() }, { archivedAt });
    if (result.affected !== 1) return await this.projectRepository.findOneByOrFail({ id });
    project.archivedAt = archivedAt;
    await this.audit.record({
      domain: 'project',
      action: 'project.archived',
      actor: { id: ownerUserId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
      subject: { type: 'project', id: project.id },
      details: { ...this.projectDetails(project, 'after'), 'after.archived': 1 },
    });
    return project;
  }

  public async unarchiveOne(
    ownerUserId: number,
    id: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<Project> {
    const project = await this.projectAccessService.ensureOwner(ownerUserId, id);
    const result = await this.projectRepository.update({ id, archivedAt: Not(IsNull()) }, { archivedAt: null });
    if (result.affected !== 1) return await this.projectRepository.findOneByOrFail({ id });
    project.archivedAt = null;
    await this.audit.record({
      domain: 'project',
      action: 'project.unarchived',
      actor: { id: ownerUserId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
      subject: { type: 'project', id: project.id },
      details: { ...this.projectDetails(project, 'after'), 'after.archived': 0 },
    });
    return project;
  }

  public async listMembers(projectId: number): Promise<ProjectMember[]> {
    return await this.projectMemberRepository.find({
      where: { project: { id: projectId } },
      relations: { user: true },
      order: { joinedAt: 'ASC' },
    });
  }

  public async removeMember(
    actorId: number,
    projectId: number,
    memberId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<void> {
    await this.projectAccessService.ensureOwner(actorId, projectId);
    const member = await this.projectMemberRepository.findOne({
      where: { id: memberId, project: { id: projectId } },
    });

    if (!member) {
      throw new NotFoundException('Project member not found');
    }

    const result = await this.projectMemberRepository.delete(member.id);
    if (result.affected !== 1) return;
    await this.audit.record({
      domain: 'project',
      action: 'project.member.removed',
      actor: { id: actorId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
      subject: { type: 'project.member', id: member.id },
      details: { projectId, memberId: member.id, userId: member.userId, role: member.role },
    });
  }

  public async listProjectInvitations(projectId: number): Promise<ProjectInvitation[]> {
    return await this.projectInvitationRepository.find({
      where: { project: { id: projectId } },
      relations: { invitedUser: true, inviter: true, project: { owner: true } },
      order: { createdAt: 'DESC' },
    });
  }

  private projectDetails(project: Project, state: 'before' | 'after'): Record<string, string | number> {
    const details: Record<string, string | number> = {
      projectId: project.id,
      [`${state}.hasLogo`]: project.logo ? 1 : 0,
    };
    const name = project.name.trim();
    if (!name) return { ...details, [`${state}.nameOmitted`]: 1 };
    let displayName = '';
    for (const character of name) {
      if (Buffer.byteLength(displayName + character, 'utf8') > 160) break;
      displayName += character;
    }
    return {
      ...details,
      [`${state}.name`]: displayName,
      ...(displayName === name ? {} : { [`${state}.nameTruncated`]: 1 }),
    };
  }

  private async setLogo(project: Project, logo: FileUpload) {
    const logoFilename = await this.fileStorageService.saveFile(logo, `projects/${project.id}`);
    project.logo = logoFilename;
  }

  public async create(
    ownerUserId: number,
    data: CreateProjectDto,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<Project> {
    const project = await this.projectRepository.save({
      owner: { id: ownerUserId },
      name: data.name,
      description: data.description,
    });

    await this.audit.record({
      domain: 'project',
      action: 'project.created',
      actor: { id: ownerUserId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
      subject: { type: 'project', id: project.id },
      details: this.projectDetails(project, 'after'),
    });
    this.metricsService.projectsTotal.inc();

    if (data.logo) {
      const before = this.projectDetails(project, 'before');
      await this.setLogo(project, data.logo);
      await this.projectRepository.save(project);
      await this.audit.record({
        domain: 'project',
        action: 'project.updated',
        actor: { id: ownerUserId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
        subject: { type: 'project', id: project.id },
        details: { ...before, ...this.projectDetails(project, 'after'), changedFields: JSON.stringify(['logo']) },
      });
    }
    return project;
  }

  public async deleteOne(
    ownerUserId: number,
    id: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<void> {
    const project = await this.projectAccessService.ensureOwner(ownerUserId, id);
    const details = this.projectDetails(project, 'before');
    await this.projectRepository.manager.transaction(async (manager) => {
      await manager.getRepository(ResourceUsage).update({ projectId: id }, { projectId: null });
      const result = await manager.getRepository(Project).delete(id);
      if (result.affected !== 1) throw new NotFoundException('Project not found');
      await this.audit.record(
        {
          domain: 'project',
          action: 'project.deleted',
          actor: { id: ownerUserId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
          subject: { type: 'project', id: id },
          details: details,
        },
        manager,
      );
    });
    this.metricsService.projectsTotal.dec();
  }

  public async updateOne(
    ownerUserId: number,
    id: number,
    data: UpdateProjectDto,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<Project> {
    const project = await this.projectAccessService.ensureOwner(ownerUserId, id);
    const before = this.projectDetails(project, 'before');
    const beforeName = project.name;
    const beforeDescription = project.description;
    const beforeLogo = project.logo;

    if (data.description !== undefined) {
      project.description = data.description;
    }

    if (data.name !== undefined) {
      project.name = data.name;
    }

    if (data.logo ?? data.deleteLogo) {
      if (project.logo) {
        await this.fileStorageService.deleteFile(`projects/${project.id}`, project.logo);
        project.logo = null;
      }

      if (data.logo) {
        await this.setLogo(project, data.logo);
      }
    }

    const saved = await this.projectRepository.save(project);
    const changedFields = [
      ...(beforeName !== saved.name ? ['name'] : []),
      ...(data.description !== undefined && data.description !== beforeDescription ? ['description'] : []),
      ...(beforeLogo !== saved.logo ? ['logo'] : []),
    ];
    if (changedFields.length) {
      await this.audit.record({
        domain: 'project',
        action: 'project.updated',
        actor: { id: ownerUserId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
        subject: { type: 'project', id: saved.id },
        details: {
          ...before,
          ...this.projectDetails(saved, 'after'),
          ...(data.description !== undefined && data.description !== beforeDescription
            ? { descriptionChanged: 1 }
            : {}),
          changedFields: JSON.stringify(changedFields),
        },
      });
    }
    return saved;
  }

  async listPendingInvitationsForUser(userId: number): Promise<ProjectInvitation[]> {
    return this.invitations.listPendingInvitationsForUser(userId);
  }

  async acceptInvitation(
    userId: number,
    invitationId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitation> {
    return this.invitations.acceptInvitation(userId, invitationId, authenticationMethod, apiTokenId);
  }

  async declineInvitation(
    userId: number,
    invitationId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitation> {
    return this.invitations.declineInvitation(userId, invitationId, authenticationMethod, apiTokenId);
  }

  async createProjectInvitation(
    ownerId: number,
    projectId: number,
    invitedUserId: number,
    role: ProjectMemberRole = ProjectMemberRole.VIEWER,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitation> {
    return this.invitations.createProjectInvitation(
      ownerId,
      projectId,
      invitedUserId,
      role,
      authenticationMethod,
      apiTokenId,
    );
  }

  async resendProjectInvitation(
    ownerId: number,
    projectId: number,
    invitationId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitation> {
    return this.invitations.resendProjectInvitation(ownerId, projectId, invitationId, authenticationMethod, apiTokenId);
  }

  async cancelProjectInvitation(
    ownerId: number,
    projectId: number,
    invitationId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitation> {
    return this.invitations.cancelProjectInvitation(ownerId, projectId, invitationId, authenticationMethod, apiTokenId);
  }
}
