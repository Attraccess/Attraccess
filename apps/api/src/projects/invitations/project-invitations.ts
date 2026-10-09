import {
  Project,
  ProjectInvitation,
  ProjectInvitationStatus,
  ProjectMember,
  ProjectMemberRole,
  User,
} from '@attraccess/database-entities';

import { BadRequestException, NotFoundException } from '@nestjs/common';

import { NotificationCategory } from '../../notifications/notification-types';

import { Repository } from 'typeorm';

import { AuditService } from '../../audit/audit.service';

import { FileStorageService } from '../../common/services/file-storage.service';

import { FileUpload } from '../../common/types/file-upload.types';

import { EmailService } from '../../email/email.service';

import { MetricsService } from '../../metrics/metrics.service';

import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';

import { ProjectAccessService } from '../project-access.service';

export abstract class ProjectInvitations {
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
    return await this.respondToInvitation(
      userId,
      invitationId,
      ProjectInvitationStatus.ACCEPTED,
      authenticationMethod,
      apiTokenId,
    );
  }

  public async declineInvitation(
    userId: number,
    invitationId: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitation> {
    return await this.respondToInvitation(
      userId,
      invitationId,
      ProjectInvitationStatus.DECLINED,
      authenticationMethod,
      apiTokenId,
    );
  }

  protected async respondToInvitation(
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

    await this.audit.recordProject({
      action:
        status === ProjectInvitationStatus.ACCEPTED ? 'project.invitation.accepted' : 'project.invitation.rejected',
      actorId: userId,
      authenticationMethod,
      apiTokenId,
      subjectType: 'project.invitation',
      subjectId: invitation.id,
      details: this.invitationDetails(invitation),
    });

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

    return this.getInvitationWithRelations(invitation.id);
  }

  protected async ensureMemberRecord(
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

  protected async getInvitationWithRelations(invitationId: number): Promise<ProjectInvitation> {
    const invitation = await this.projectInvitationRepository.findOne({
      where: { id: invitationId },
      relations: { invitedUser: true, inviter: true, project: { owner: true } },
    });

    if (!invitation) {
      throw new NotFoundException('Project invitation not found');
    }

    return invitation;
  }

  protected async dispatchProjectInvitationNotification(
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
      details: { projectId, invitationId: invitation.id, userId: invitedUserId, role },
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

  protected abstract readonly fileStorageService: FileStorageService;

  protected abstract readonly projectRepository: Repository<Project>;

  protected abstract readonly audit: AuditService;

  protected abstract projectDetails(project: Project, state: 'before' | 'after'): Record<string, string | number>;

  protected abstract readonly metricsService: MetricsService;

  protected abstract setLogo(project: Project, logo: FileUpload): Promise<void>;

  protected abstract readonly projectAccessService: ProjectAccessService;

  protected abstract readonly userRepository: Repository<User>;

  protected abstract readonly projectMemberRepository: Repository<ProjectMember>;

  protected abstract readonly projectInvitationRepository: Repository<ProjectInvitation>;

  protected abstract invitationDetails(invitation: ProjectInvitation): Record<string, string | number>;

  protected abstract readonly notifications: NotificationDispatchService;

  protected abstract readonly emailService: EmailService;
}
