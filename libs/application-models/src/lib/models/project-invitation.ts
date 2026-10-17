import { Project } from './project';
import { User } from './user';
import { ProjectMemberRole } from './project-member';

export enum ProjectInvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  CANCELED = 'canceled',
}

export interface ProjectInvitation {
  id: number;
  projectId: number;
  project: Project;
  inviterId: number;
  inviter: User;
  invitedUserId: number;
  invitedUser: User;
  status: ProjectInvitationStatus;
  requestedRole: ProjectMemberRole;
  respondedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
