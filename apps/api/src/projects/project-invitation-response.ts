import {
  Project,
  ProjectInvitation,
  ProjectInvitationStatus,
  ProjectMember,
  ProjectMemberRole,
  User,
} from '@attraccess/database-entities';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationCategory } from '../notifications/notification-types';
import { ProjectInvitationManagementImplementation } from './project-invitation-management';
export abstract class ProjectInvitationResponseImplementation extends ProjectInvitationManagementImplementation {
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
}
