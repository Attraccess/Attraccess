import {
  ProjectMemberRole,
  type ProjectInvitationRecord,
  type ProjectMemberRecord,
  type ProjectRecord,
} from '@attraccess/application-models';

import { Injectable, NotFoundException, Inject } from '@nestjs/common';

import { AUDIT_RECORDER, AuditRecorder } from '../audit/recorder/audit-event';

import { FileStorageService } from '../common/services/file-storage.service';

import { EmailService } from '../email/email.service';

import { MetricsService } from '../metrics/metrics.service';

import { NotificationDispatchService } from '../notifications/notification-dispatch.service';

import { UNIT_OF_WORK, type UnitOfWork } from '../database/unit-of-work';

import { auditTransactionOf } from '../database/adapters/transaction-scope';

import { FindManyProjectsQueryDto } from './dto/find-many-query.dto';

import { ProjectAccessService, type ProjectWithAccess } from './project-access.service';

import { FileUpload } from '../common/types/file-upload.types';

import { CreateProjectDto } from './dto/create.dto';

import { UpdateProjectDto } from './dto/update.dto';

import { ProjectInvitations } from './invitations/project-invitations';

import {
  PROJECT_INVITATION_STORE,
  PROJECT_STORE,
  type ProjectInvitationStore,
  type ProjectStore,
} from './project.port';

@Injectable()
export class ProjectsService {
  private readonly invitations: ProjectInvitations;

  constructor(
    @Inject(PROJECT_STORE) private readonly projects: ProjectStore,
    @Inject(PROJECT_INVITATION_STORE) private readonly invitationStore: ProjectInvitationStore,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
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
      this.projects,
      this.invitationStore,
      this.notifications,
      this.emailService,
    );
  }

  public async findMany(userId: number, query: FindManyProjectsQueryDto): Promise<ProjectWithAccess[]> {
    const projects = await this.projects.listAccessible(userId, query);
    return this.projectAccessService.addAccessMetadata(userId, projects);
  }

  public async getTotalCount(
    userId: number,
    query: { includeArchived?: boolean; search?: string } = {},
  ): Promise<number> {
    return await this.projects.countAccessible(userId, query);
  }

  public async findOneById(userId: number, id: number): Promise<ProjectWithAccess> {
    return this.projectAccessService.getAccessOrThrow(userId, id);
  }

  public async archiveOne(
    ownerUserId: number,
    id: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ProjectRecord> {
    const project = await this.projectAccessService.ensureOwner(ownerUserId, id);
    const archivedAt = new Date();
    if (!(await this.projects.archive(id, archivedAt))) return await this.projects.getById(id);
    const archived = { ...project, archivedAt };
    await this.audit.record({
      domain: 'project',
      action: 'project.archived',
      actor: { id: ownerUserId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
      subject: { type: 'project', id: archived.id },
      details: { ...this.projectDetails(archived, 'after'), 'after.archived': 1 },
    });
    return archived;
  }

  public async unarchiveOne(
    ownerUserId: number,
    id: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ProjectRecord> {
    const project = await this.projectAccessService.ensureOwner(ownerUserId, id);
    if (!(await this.projects.unarchive(id))) return await this.projects.getById(id);
    const unarchived = { ...project, archivedAt: null };
    await this.audit.record({
      domain: 'project',
      action: 'project.unarchived',
      actor: { id: ownerUserId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
      subject: { type: 'project', id: unarchived.id },
      details: { ...this.projectDetails(unarchived, 'after'), 'after.archived': 0 },
    });
    return unarchived;
  }

  public async listMembers(projectId: number): Promise<ProjectMemberRecord[]> {
    return await this.projects.listMembers(projectId);
  }

  public async removeMember(
    actorId: number,
    projectId: number,
    memberId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<void> {
    await this.projectAccessService.ensureOwner(actorId, projectId);
    const member = await this.projects.findMember(projectId, memberId);

    if (!member) {
      throw new NotFoundException('Project member not found');
    }

    if (!(await this.projects.removeMember(member.id))) return;
    await this.audit.record({
      domain: 'project',
      action: 'project.member.removed',
      actor: { id: actorId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
      subject: { type: 'project.member', id: member.id },
      details: { projectId, memberId: member.id, userId: member.userId, role: member.role },
    });
  }

  public async listProjectInvitations(projectId: number): Promise<ProjectInvitationRecord[]> {
    return await this.invitationStore.listForProject(projectId);
  }

  private projectDetails(project: ProjectRecord, state: 'before' | 'after'): Record<string, string | number> {
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

  private async setLogo(project: ProjectRecord, logo: FileUpload): Promise<ProjectRecord> {
    const logoFilename = await this.fileStorageService.saveFile(logo, `projects/${project.id}`);
    return { ...project, logo: logoFilename };
  }

  public async create(
    ownerUserId: number,
    data: CreateProjectDto,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ProjectRecord> {
    let project = await this.projects.create({
      ownerId: ownerUserId,
      name: data.name,
      description: data.description ?? null,
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
      project = await this.setLogo(project, data.logo);
      project = await this.projects.updateDetails(project.id, {
        name: project.name,
        description: project.description,
        logo: project.logo,
      });
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
    await this.uow.run(async (scope) => {
      if (!(await this.projects.deleteProject(id, scope))) throw new NotFoundException('Project not found');
      await this.audit.record(
        {
          domain: 'project',
          action: 'project.deleted',
          actor: { id: ownerUserId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
          subject: { type: 'project', id: id },
          details: details,
        },
        auditTransactionOf(this.uow, scope),
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
  ): Promise<ProjectRecord> {
    const existing = await this.projectAccessService.ensureOwner(ownerUserId, id);
    const before = this.projectDetails(existing, 'before');
    const beforeName = existing.name;
    const beforeDescription = existing.description;
    const beforeLogo = existing.logo;
    let project = { ...existing };

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
        project = await this.setLogo(project, data.logo);
      }
    }

    const saved = await this.projects.updateDetails(project.id, {
      name: project.name,
      description: project.description,
      logo: project.logo,
    });
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

  async listPendingInvitationsForUser(userId: number): Promise<ProjectInvitationRecord[]> {
    return this.invitations.listPendingInvitationsForUser(userId);
  }

  async acceptInvitation(
    userId: number,
    invitationId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitationRecord> {
    return this.invitations.acceptInvitation(userId, invitationId, authenticationMethod, apiTokenId);
  }

  async declineInvitation(
    userId: number,
    invitationId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitationRecord> {
    return this.invitations.declineInvitation(userId, invitationId, authenticationMethod, apiTokenId);
  }

  async createProjectInvitation(
    ownerId: number,
    projectId: number,
    invitedUserId: number,
    role: ProjectMemberRole = ProjectMemberRole.VIEWER,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitationRecord> {
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
  ): Promise<ProjectInvitationRecord> {
    return this.invitations.resendProjectInvitation(ownerId, projectId, invitationId, authenticationMethod, apiTokenId);
  }

  async cancelProjectInvitation(
    ownerId: number,
    projectId: number,
    invitationId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitationRecord> {
    return this.invitations.cancelProjectInvitation(ownerId, projectId, invitationId, authenticationMethod, apiTokenId);
  }
}
