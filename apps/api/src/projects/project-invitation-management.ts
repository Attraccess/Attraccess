import { ProjectInvitation, ProjectInvitationStatus, ProjectMemberRole } from '@attraccess/database-entities';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProjectsServiceRouteContext } from './projects.service.route-context';
export abstract class ProjectInvitationManagementImplementation extends ProjectsServiceRouteContext {
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
}
