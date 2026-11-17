import {
  ProjectInvitationStatus,
  ProjectMemberRole,
  type ProjectInvitationRecord,
  type ProjectMemberRecord,
  type ProjectRecord,
  type UserContact,
} from '@attraccess/application-models';

import { BadRequestException, NotFoundException } from '@nestjs/common';

import { NotificationCategory } from '../../notifications/notification-types';

import { AuditRecorder } from '../../audit/recorder/audit-event';
import { EmailService } from '../../email/email.service';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';

import type { AuditAuthenticationMethod as AuthenticationMethod } from '@attraccess/application-models';
import { ProjectAccessService } from '../project-access.service';
import type { ProjectInvitationStore, ProjectStore } from '../project.port';

// The mail and notification services still take the ORM shapes; their migration is tracked outside this area.
type MailUser = Parameters<EmailService['sendProjectInvitationEmail']>[0];
type MailProject = Parameters<EmailService['sendProjectInvitationEmail']>[1];
type MailInvitation = Parameters<EmailService['sendProjectInvitationEmail']>[2];

/** Audit details of an invitation. */
export function invitationDetails(invitation: ProjectInvitationRecord): Record<string, string | number> {
  return {
    projectId: invitation.projectId,
    invitationId: invitation.id,
    userId: invitation.invitedUserId,
    role: invitation.requestedRole,
  };
}

/** Invitations to projects: sending, listing, accepting, declining and revoking them. */
export class ProjectInvitations {
  constructor(
    private readonly audit: AuditRecorder,
    private readonly projectAccessService: ProjectAccessService,
    private readonly projects: ProjectStore,
    private readonly invitations: ProjectInvitationStore,
    private readonly notifications: NotificationDispatchService,
    private readonly emailService: EmailService,
  ) {}

  public async listPendingInvitationsForUser(userId: number): Promise<ProjectInvitationRecord[]> {
    return await this.invitations.listPendingForUser(userId);
  }

  public async acceptInvitation(
    userId: number,
    invitationId: number,
    authenticationMethod: AuthenticationMethod = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitationRecord> {
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
    authenticationMethod: AuthenticationMethod = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitationRecord> {
    return await this.respondToInvitation(
      userId,
      invitationId,
      ProjectInvitationStatus.DECLINED,
      authenticationMethod,
      apiTokenId,
    );
  }

  public async respondToInvitation(
    userId: number,
    invitationId: number,
    status: ProjectInvitationStatus,
    authenticationMethod: AuthenticationMethod,
    apiTokenId?: number,
  ): Promise<ProjectInvitationRecord> {
    const invitation = await this.getInvitationWithRelations(invitationId);

    if (invitation.invitedUserId !== userId) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== ProjectInvitationStatus.PENDING) {
      throw new BadRequestException('Invitation has already been processed');
    }

    await this.invitations.recordResponse(invitation.id, status, new Date());

    await this.audit.record({
      domain: 'project',
      action:
        status === ProjectInvitationStatus.ACCEPTED ? 'project.invitation.accepted' : 'project.invitation.rejected',
      actor: { id: userId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
      subject: { type: 'project.invitation', id: invitation.id },
      details: invitationDetails(invitation),
    });

    if (status === ProjectInvitationStatus.ACCEPTED) {
      const member = await this.ensureMemberRecord(invitation.projectId, userId, invitation.requestedRole);
      if (member) {
        await this.audit.record({
          domain: 'project',
          action: 'project.member.added',
          actor: { id: userId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
          subject: { type: 'project.member', id: member.id },
          details: { projectId: invitation.projectId, memberId: member.id, userId, role: member.role },
        });
      }
    }

    return this.getInvitationWithRelations(invitation.id);
  }

  public async ensureMemberRecord(
    projectId: number,
    userId: number,
    role: ProjectMemberRole = ProjectMemberRole.VIEWER,
  ): Promise<ProjectMemberRecord | null> {
    return await this.invitations.addMemberIfMissing(projectId, userId, role);
  }

  public async getInvitationWithRelations(invitationId: number): Promise<ProjectInvitationRecord> {
    const invitation = await this.invitations.findById(invitationId);

    if (!invitation) {
      throw new NotFoundException('Project invitation not found');
    }

    return invitation;
  }

  public async dispatchProjectInvitationNotification(
    invitedUser: UserContact,
    project: ProjectRecord,
    invitation: ProjectInvitationRecord,
  ): Promise<void> {
    await this.notifications.dispatch({
      category: NotificationCategory.PROJECT_INVITATIONS,
      recipients: [invitedUser as unknown as MailUser],
      actorId: invitation.inviterId,
      title: `You have been invited to ${project.name}`,
      body: `${invitation.inviter?.username ?? 'A project owner'} invited you to join ${project.name}.`,
      url: `/projects?invitation=${invitation.id}`,
      sendEmail: (recipient) =>
        this.emailService.sendProjectInvitationEmail(
          recipient,
          project as unknown as MailProject,
          invitation as unknown as MailInvitation,
        ),
    });
  }

  public async createProjectInvitation(
    ownerId: number,
    projectId: number,
    invitedUserId: number,
    role: ProjectMemberRole = ProjectMemberRole.VIEWER,
    authenticationMethod: AuthenticationMethod = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitationRecord> {
    const project = await this.projectAccessService.ensureOwner(ownerId, projectId);
    const invitedUser = await this.invitations.findInvitee(invitedUserId);

    if (!invitedUser) {
      throw new NotFoundException('User not found');
    }

    if (invitedUser.id === project.owner?.id) {
      throw new BadRequestException('Project owner already has access');
    }

    const existingMember = await this.projects.findMembership(projectId, invitedUserId);
    if (existingMember) {
      throw new BadRequestException('User is already a project member');
    }

    const existingInvitation = await this.invitations.findPending(projectId, invitedUserId);
    if (existingInvitation) {
      throw new BadRequestException('User already has a pending invitation');
    }

    const invitation = await this.invitations.create({
      projectId,
      inviterId: ownerId,
      invitedUserId,
      requestedRole: role,
    });

    await this.audit.record({
      domain: 'project',
      action: 'project.invitation.sent',
      actor: { id: ownerId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
      subject: { type: 'project.invitation', id: invitation.id },
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
    authenticationMethod: AuthenticationMethod = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitationRecord> {
    await this.projectAccessService.ensureOwner(ownerId, projectId);
    const invitation = await this.getInvitationWithRelations(invitationId);

    if (invitation.projectId !== projectId) {
      throw new NotFoundException('Project invitation not found');
    }

    if (invitation.status !== ProjectInvitationStatus.PENDING) {
      throw new BadRequestException('Only pending invitations can be resent');
    }

    await this.invitations.touch(invitation.id, new Date());
    await this.audit.record({
      domain: 'project',
      action: 'project.invitation.sent',
      actor: { id: ownerId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
      subject: { type: 'project.invitation', id: invitation.id },
      details: invitationDetails(invitation),
    });
    await this.dispatchProjectInvitationNotification(
      invitation.invitedUser as UserContact,
      invitation.project as ProjectRecord,
      invitation,
    );

    return this.getInvitationWithRelations(invitation.id);
  }

  public async cancelProjectInvitation(
    ownerId: number,
    projectId: number,
    invitationId: number,
    authenticationMethod: AuthenticationMethod = 'session',
    apiTokenId?: number,
  ): Promise<ProjectInvitationRecord> {
    await this.projectAccessService.ensureOwner(ownerId, projectId);
    const invitation = await this.getInvitationWithRelations(invitationId);

    if (invitation.projectId !== projectId) {
      throw new NotFoundException('Project invitation not found');
    }

    if (invitation.status === ProjectInvitationStatus.CANCELED) {
      return invitation;
    }

    await this.invitations.recordResponse(invitation.id, ProjectInvitationStatus.CANCELED, new Date());

    await this.audit.record({
      domain: 'project',
      action: 'project.invitation.revoked',
      actor: { id: ownerId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
      subject: { type: 'project.invitation', id: invitation.id },
      details: invitationDetails(invitation),
    });
    return this.getInvitationWithRelations(invitation.id);
  }
}
