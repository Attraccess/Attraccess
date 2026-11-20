import type { ProjectInvitationRecord, ProjectMemberRecord, ProjectRecord } from '@attraccess/application-models';
import type { Project, ProjectInvitation, ProjectMember } from '@attraccess/database-entities';
import { toUserContact, toUserProfile } from '../users/user-mapping';

export function toProjectRecord(project: Project): ProjectRecord {
  return {
    id: project.id,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    archivedAt: project.archivedAt ?? null,
    name: project.name,
    description: project.description ?? null,
    logo: project.logo ?? null,
    ...(project.owner ? { owner: toUserProfile(project.owner) } : {}),
  };
}

export function toProjectMemberRecord(member: ProjectMember): ProjectMemberRecord {
  return {
    id: member.id,
    projectId: member.projectId,
    userId: member.userId,
    role: member.role,
    joinedAt: member.joinedAt,
    ...(member.user ? { user: toUserProfile(member.user) } : {}),
  };
}

export function toProjectInvitationRecord(invitation: ProjectInvitation): ProjectInvitationRecord {
  return {
    id: invitation.id,
    projectId: invitation.projectId,
    inviterId: invitation.inviterId,
    invitedUserId: invitation.invitedUserId,
    status: invitation.status,
    requestedRole: invitation.requestedRole,
    respondedAt: invitation.respondedAt ?? null,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
    ...(invitation.project ? { project: toProjectRecord(invitation.project) } : {}),
    ...(invitation.inviter ? { inviter: toUserContact(invitation.inviter) } : {}),
    ...(invitation.invitedUser ? { invitedUser: toUserContact(invitation.invitedUser) } : {}),
  };
}
