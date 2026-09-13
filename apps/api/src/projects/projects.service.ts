import {
  Project,
  ProjectInvitation,
  ProjectInvitationStatus,
  ProjectMember,
  ProjectMemberRole,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FindManyProjectsQueryDto } from './dto/find-many-query.dto';
import { CreateProjectDto } from './dto/create.dto';
import { FileStorageService } from '../common/services/file-storage.service';
import { UpdateProjectDto } from './dto/update.dto';
import { FileUpload } from '../common/types/file-upload.types';
import { ProjectAccessService } from './project-access.service';
import { ProjectWithAccessDto } from './dto/project-access.dto';
import { EmailService } from '../email/email.service';
import { MetricsService } from '../metrics/metrics.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { NotificationCategory } from '../notifications/notification-types';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ProjectsService {
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
    private readonly audit: AuditService,
  ) {}

  public async findMany(userId: number, query: FindManyProjectsQueryDto): Promise<ProjectWithAccessDto[]> {
    const { page, limit: take, includeArchived } = query;
    const skip = (page - 1) * take;

    const qb = this.projectRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.owner', 'owner')
      .leftJoin('project.members', 'member', 'member.userId = :userId', { userId })
      .where('(owner.id = :userId OR member.id IS NOT NULL)', { userId });

    if (includeArchived !== true) {
      qb.andWhere('project.archivedAt IS NULL');
    }

    const projects = await qb
      .orderBy('project.name', 'ASC')
      .addOrderBy('project.createdAt', 'DESC')
      .skip(skip)
      .take(take)
      .getMany();

    return this.projectAccessService.addAccessMetadata(userId, projects);
  }

  public async getTotalCount(userId: number, query: { includeArchived?: boolean } = {}): Promise<number> {
    const includeArchived = query.includeArchived ?? false;
    const qb = this.projectRepository
      .createQueryBuilder('project')
      .leftJoin('project.owner', 'owner')
      .leftJoin('project.members', 'member', 'member.userId = :userId', { userId })
      .where('(owner.id = :userId OR member.id IS NOT NULL)', { userId });

    if (!includeArchived) {
      qb.andWhere('project.archivedAt IS NULL');
    }

    return await qb.getCount();
  }

  public async findOneById(userId: number, id: number): Promise<Project> {
    return this.projectAccessService.getAccessOrThrow(userId, id);
  }

  private async setLogo(project: Project, logo: FileUpload) {
    const logoFilename = await this.fileStorageService.saveFile(logo, `projects/${project.id}`);
    project.logo = logoFilename;
    await this.projectRepository.save(project);
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

    if (data.logo) {
      await this.setLogo(project, data.logo);
    }

    this.metricsService.projectsTotal.inc();
    await this.audit.recordProject({
      action: 'project.created',
      actorId: ownerUserId,
      authenticationMethod,
      apiTokenId,
      subjectType: 'project',
      subjectId: project.id,
      details: this.projectDetails(project, 'after'),
    });
    return project;
  }

  public async archiveOne(
    ownerUserId: number,
    id: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<Project> {
    const project = await this.projectAccessService.ensureOwner(ownerUserId, id);
    project.archivedAt = new Date();
    const saved = await this.projectRepository.save(project);
    await this.audit.recordProject({
      action: 'project.archived', actorId: ownerUserId, authenticationMethod, apiTokenId,
      subjectType: 'project', subjectId: saved.id,
      details: { ...this.projectDetails(saved, 'after'), 'after.archived': 1 },
    });
    return saved;
  }

  public async unarchiveOne(
    ownerUserId: number,
    id: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<Project> {
    const project = await this.projectAccessService.ensureOwner(ownerUserId, id);
    project.archivedAt = null;
    const saved = await this.projectRepository.save(project);
    await this.audit.recordProject({
      action: 'project.unarchived', actorId: ownerUserId, authenticationMethod, apiTokenId,
      subjectType: 'project', subjectId: saved.id,
      details: { ...this.projectDetails(saved, 'after'), 'after.archived': 0 },
    });
    return saved;
  }

  public async deleteOne(
    ownerUserId: number,
    id: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<void> {
    const project = await this.projectAccessService.ensureOwner(ownerUserId, id);
    const details = this.projectDetails(project, 'before');
    await this.resourceUsageRepository.update({ projectId: id }, { projectId: null });
    const result = await this.projectRepository.delete(id);
    if (result.affected !== 1) return;
    this.metricsService.projectsTotal.dec();
    await this.audit.recordProject({
      action: 'project.deleted',
      actorId: ownerUserId,
      authenticationMethod,
      apiTokenId,
      subjectType: 'project',
      subjectId: id,
      details,
    });
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
      ...(before['before.name'] !== saved.name ? ['name'] : []),
      ...(data.description !== undefined && data.description !== beforeDescription ? ['description'] : []),
      ...(beforeLogo !== saved.logo ? ['logo'] : []),
    ];
    if (changedFields.length) {
      await this.audit.recordProject({
        action: 'project.updated',
        actorId: ownerUserId,
        authenticationMethod,
        apiTokenId,
        subjectType: 'project',
        subjectId: saved.id,
        details: {
          ...before,
          ...this.projectDetails(saved, 'after'),
          ...(data.description !== undefined && data.description !== beforeDescription ? { descriptionChanged: 1 } : {}),
          changedFields: JSON.stringify(changedFields),
        },
      });
    }
    return saved;
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
    await this.audit.recordProject({
      action: 'project.member.removed',
      actorId,
      authenticationMethod,
      apiTokenId,
      subjectType: 'project.member',
      subjectId: member.id,
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

  public async createProjectInvitation(
    ownerId: number,
    projectId: number,
    invitedUserId: number,
    role: ProjectMemberRole = ProjectMemberRole.VIEWER,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitation> {
    const project = await this.projectAccessService.ensureOwner(ownerId, projectId);
    const invitedUser = await this.userRepository.findOne({ where: { id: invitedUserId } });

    if (!invitedUser) {
      throw new NotFoundException('User not found');
    }

    if (invitedUser.id === project.owner?.id) {
      throw new BadRequestException('Project owner already has access');
    }

    const existingMember = await this.projectMemberRepository.findOne({
      where: {
        project: { id: projectId },
        user: { id: invitedUserId },
      },
    });
    if (existingMember) {
      throw new BadRequestException('User is already a project member');
    }

    const existingInvitation = await this.projectInvitationRepository.findOne({
      where: {
        project: { id: projectId },
        invitedUser: { id: invitedUserId },
        status: ProjectInvitationStatus.PENDING,
      },
    });
    if (existingInvitation) {
      throw new BadRequestException('User already has a pending invitation');
    }

    const invitation = await this.projectInvitationRepository.save({
      project: { id: projectId },
      inviter: { id: ownerId },
      invitedUser: { id: invitedUserId },
      status: ProjectInvitationStatus.PENDING,
      requestedRole: role,
    });

    await this.audit.recordProject({
      action: 'project.invitation.sent',
      actorId: ownerId,
      authenticationMethod,
      apiTokenId,
      subjectType: 'project.invitation',
      subjectId: invitation.id,
      details: this.invitationDetails(invitation),
    });
    const hydratedInvitation = await this.getInvitationWithRelations(invitation.id);
    await this.dispatchProjectInvitationNotification(invitedUser, project, hydratedInvitation);
    return hydratedInvitation;
  }

  public async resendProjectInvitation(
    ownerId: number,
    projectId: number,
    invitationId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitation> {
    await this.projectAccessService.ensureOwner(ownerId, projectId);
    const invitation = await this.getInvitationWithRelations(invitationId);

    if (invitation.projectId !== projectId) {
      throw new NotFoundException('Project invitation not found');
    }

    if (invitation.status !== ProjectInvitationStatus.PENDING) {
      throw new BadRequestException('Only pending invitations can be resent');
    }

    invitation.updatedAt = new Date();
    await this.projectInvitationRepository.save(invitation);
    await this.audit.recordProject({
      action: 'project.invitation.sent',
      actorId: ownerId,
      authenticationMethod,
      apiTokenId,
      subjectType: 'project.invitation',
      subjectId: invitation.id,
      details: this.invitationDetails(invitation),
    });
    await this.dispatchProjectInvitationNotification(invitation.invitedUser, invitation.project, invitation);

    return this.getInvitationWithRelations(invitation.id);
  }

  public async cancelProjectInvitation(
    ownerId: number,
    projectId: number,
    invitationId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitation> {
    await this.projectAccessService.ensureOwner(ownerId, projectId);
    const invitation = await this.getInvitationWithRelations(invitationId);

    if (invitation.projectId !== projectId) {
      throw new NotFoundException('Project invitation not found');
    }

    if (invitation.status === ProjectInvitationStatus.CANCELED) {
      return invitation;
    }

    invitation.status = ProjectInvitationStatus.CANCELED;
    invitation.respondedAt = new Date();
    await this.projectInvitationRepository.save(invitation);

    await this.audit.recordProject({
      action: 'project.invitation.revoked',
      actorId: ownerId,
      authenticationMethod,
      apiTokenId,
      subjectType: 'project.invitation',
      subjectId: invitation.id,
      details: this.invitationDetails(invitation),
    });
    return this.getInvitationWithRelations(invitation.id);
  }

  public async listPendingInvitationsForUser(userId: number): Promise<ProjectInvitation[]> {
    return await this.projectInvitationRepository.find({
      where: { invitedUser: { id: userId }, status: ProjectInvitationStatus.PENDING },
      relations: { invitedUser: true, inviter: true, project: { owner: true } },
      order: { createdAt: 'DESC' },
    });
  }

  public async acceptInvitation(
    userId: number,
    invitationId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitation> {
    return await this.respondToInvitation(userId, invitationId, ProjectInvitationStatus.ACCEPTED, authenticationMethod, apiTokenId);
  }

  public async declineInvitation(
    userId: number,
    invitationId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitation> {
    return await this.respondToInvitation(userId, invitationId, ProjectInvitationStatus.DECLINED, authenticationMethod, apiTokenId);
  }

  private async respondToInvitation(
    userId: number,
    invitationId: number,
    status: ProjectInvitationStatus,
    authenticationMethod: 'session' | 'api-token',
    apiTokenId?: number,
  ): Promise<ProjectInvitation> {
    const invitation = await this.getInvitationWithRelations(invitationId);

    if (invitation.invitedUserId !== userId) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== ProjectInvitationStatus.PENDING) {
      throw new BadRequestException('Invitation has already been processed');
    }

    invitation.status = status;
    invitation.respondedAt = new Date();
    await this.projectInvitationRepository.save(invitation);

    if (status === ProjectInvitationStatus.ACCEPTED) {
      const member = await this.ensureMemberRecord(invitation.projectId, userId, invitation.requestedRole);
      if (member) {
        await this.audit.recordProject({
          action: 'project.member.added',
          actorId: userId,
          authenticationMethod,
          apiTokenId,
          subjectType: 'project.member',
          subjectId: member.id,
          details: { projectId: invitation.projectId, memberId: member.id, userId, role: member.role },
        });
      }
    }

    await this.audit.recordProject({
      action: status === ProjectInvitationStatus.ACCEPTED ? 'project.invitation.accepted' : 'project.invitation.rejected',
      actorId: userId,
      authenticationMethod,
      apiTokenId,
      subjectType: 'project.invitation',
      subjectId: invitation.id,
      details: this.invitationDetails(invitation),
    });
    return this.getInvitationWithRelations(invitation.id);
  }

  private async ensureMemberRecord(
    projectId: number,
    userId: number,
    role: ProjectMemberRole = ProjectMemberRole.VIEWER,
  ): Promise<ProjectMember | null> {
    const existingMembership = await this.projectMemberRepository.findOne({
      where: {
        project: { id: projectId },
        user: { id: userId },
      },
    });

    if (existingMembership) {
      return null;
    }

    return await this.projectMemberRepository.save({
      project: { id: projectId },
      user: { id: userId },
      role,
    });
  }

  private async getInvitationWithRelations(invitationId: number): Promise<ProjectInvitation> {
    const invitation = await this.projectInvitationRepository.findOne({
      where: { id: invitationId },
      relations: { invitedUser: true, inviter: true, project: { owner: true } },
    });

    if (!invitation) {
      throw new NotFoundException('Project invitation not found');
    }

    return invitation;
  }

  private async dispatchProjectInvitationNotification(
    invitedUser: User,
    project: Project,
    invitation: ProjectInvitation,
  ): Promise<void> {
    await this.notifications.dispatch({
      category: NotificationCategory.PROJECT_INVITATIONS,
      recipients: [invitedUser],
      actorId: invitation.inviterId,
      title: `You have been invited to ${project.name}`,
      body: `${invitation.inviter?.username ?? 'A project owner'} invited you to join ${project.name}.`,
      url: `/projects?invitation=${invitation.id}`,
      sendEmail: (recipient) => this.emailService.sendProjectInvitationEmail(recipient, project, invitation),
    });
  }

  private projectDetails(project: Project, state: 'before' | 'after'): Record<string, string | number> {
    return { projectId: project.id, [`${state}.name`]: project.name, [`${state}.hasLogo`]: project.logo ? 1 : 0 };
  }

  private invitationDetails(invitation: ProjectInvitation): Record<string, string | number> {
    return {
      projectId: invitation.projectId,
      invitationId: invitation.id,
      userId: invitation.invitedUserId,
      role: invitation.requestedRole,
    };
  }
}
