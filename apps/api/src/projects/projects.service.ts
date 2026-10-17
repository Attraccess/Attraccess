import { Project, ProjectInvitation, ProjectMember } from '@attraccess/application-models';

import { Injectable, NotFoundException } from '@nestjs/common';

import { ProjectDeleteMissing, ProjectPersistence } from './persistence/port';

import { AuditService } from '../audit/audit.service';

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
export class ProjectsService extends ProjectInvitations {
  constructor(
    protected readonly persistence: ProjectPersistence,
    protected readonly fileStorageService: FileStorageService,
    protected readonly projectAccessService: ProjectAccessService,
    protected readonly emailService: EmailService,
    protected readonly metricsService: MetricsService,
    protected readonly notifications: NotificationDispatchService,
    protected readonly audit: AuditService,
  ) {
    super();
  }

  public async findMany(userId: number, query: FindManyProjectsQueryDto): Promise<ProjectWithAccessDto[]> {
    const projects = await this.persistence.accessiblePage(
      userId,
      query.page,
      query.limit,
      query.includeArchived === true,
    );
    return this.projectAccessService.addAccessMetadata(userId, projects);
  }

  public async getTotalCount(userId: number, query: { includeArchived?: boolean } = {}): Promise<number> {
    return this.persistence.accessibleCount(userId, query.includeArchived ?? false);
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
    const changed = await this.persistence.setArchived(id, archivedAt);
    if (!changed) return this.persistence.requireProject(id);
    project.archivedAt = archivedAt;
    await this.audit.recordProject({
      action: 'project.archived',
      actorId: ownerUserId,
      authenticationMethod,
      apiTokenId,
      subjectType: 'project',
      subjectId: project.id,
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
    const changed = await this.persistence.setArchived(id, null);
    if (!changed) return this.persistence.requireProject(id);
    project.archivedAt = null;
    await this.audit.recordProject({
      action: 'project.unarchived',
      actorId: ownerUserId,
      authenticationMethod,
      apiTokenId,
      subjectType: 'project',
      subjectId: project.id,
      details: { ...this.projectDetails(project, 'after'), 'after.archived': 0 },
    });
    return project;
  }

  public async listMembers(projectId: number): Promise<ProjectMember[]> {
    return this.persistence.members(projectId);
  }

  public async removeMember(
    actorId: number,
    projectId: number,
    memberId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<void> {
    await this.projectAccessService.ensureOwner(actorId, projectId);
    const member = await this.persistence.member(projectId, memberId);

    if (!member) {
      throw new NotFoundException('Project member not found');
    }

    const removed = await this.persistence.removeMember(member.id);
    if (!removed) return;
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
    return this.persistence.projectInvitations(projectId);
  }

  protected projectDetails(project: Project, state: 'before' | 'after'): Record<string, string | number> {
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

  protected invitationDetails(invitation: ProjectInvitation): Record<string, string | number> {
    return {
      projectId: invitation.projectId,
      invitationId: invitation.id,
      userId: invitation.invitedUserId,
      role: invitation.requestedRole,
    };
  }

  protected async setLogo(project: Project, logo: FileUpload) {
    const logoFilename = await this.fileStorageService.saveFile(logo, `projects/${project.id}`);
    project.logo = logoFilename;
  }

  public async create(
    ownerUserId: number,
    data: CreateProjectDto,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<Project> {
    const project = await this.persistence.createProject(ownerUserId, data.name, data.description);

    await this.audit.recordProject({
      action: 'project.created',
      actorId: ownerUserId,
      authenticationMethod,
      apiTokenId,
      subjectType: 'project',
      subjectId: project.id,
      details: this.projectDetails(project, 'after'),
    });
    this.metricsService.projectsTotal.inc();

    if (data.logo) {
      const before = this.projectDetails(project, 'before');
      await this.setLogo(project, data.logo);
      await this.persistence.saveProject(project);
      await this.audit.recordProject({
        action: 'project.updated',
        actorId: ownerUserId,
        authenticationMethod,
        apiTokenId,
        subjectType: 'project',
        subjectId: project.id,
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
    try {
      await this.persistence.deleteWithUsageDetachment(id);
    } catch (error) {
      if (error instanceof ProjectDeleteMissing) throw new NotFoundException('Project not found');
      throw error;
    }
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

    const saved = await this.persistence.saveProject(project);
    const changedFields = [
      ...(beforeName !== saved.name ? ['name'] : []),
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
          ...(data.description !== undefined && data.description !== beforeDescription
            ? { descriptionChanged: 1 }
            : {}),
          changedFields: JSON.stringify(changedFields),
        },
      });
    }
    return saved;
  }
}
