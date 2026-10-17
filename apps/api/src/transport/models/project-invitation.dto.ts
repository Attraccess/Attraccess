import { ApiProperty } from '@nestjs/swagger';
import { Project } from './project.dto';
import { User } from './user.dto';
import { ProjectMemberRole } from './project-member.dto';
import { ProjectInvitationStatus } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

export class ProjectInvitation {
  @ApiProperty({ description: 'Unique identifier of the project invitation' })
  id!: number;

  @ApiProperty({ description: 'Project ID for which the invitation was created' })
  projectId!: number;

  @ApiProperty({ description: 'Project for which the invitation was created', type: () => Project })
  project!: Project;

  @ApiProperty({ description: 'User ID that created the invitation' })
  inviterId!: number;

  @ApiProperty({ description: 'Inviter user', type: () => User })
  inviter!: User;

  @ApiProperty({ description: 'User ID that is being invited' })
  invitedUserId!: number;

  @ApiProperty({ description: 'Invited user', type: () => User })
  invitedUser!: User;

  @ApiProperty({
    description: 'Current status of the invitation',
    enum: ProjectInvitationStatus,
    enumName: 'ProjectInvitationStatus',
  })
  status!: ProjectInvitationStatus;

  @ApiProperty({
    description: 'Role that should be granted upon acceptance',
    enum: ProjectMemberRole,
    enumName: 'ProjectMemberRole',
  })
  requestedRole!: ProjectMemberRole;

  @ApiProperty({
    description: 'Timestamp when the invitation was responded to (accept/decline/cancel)',
    required: false,
  })
  respondedAt!: Date | null;

  @ApiProperty({ description: 'When the invitation was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'When the invitation was last updated' })
  updatedAt!: Date;
  static readonly responseFields: ResponseFields = {
    id: null,
    projectId: null,
    project: () => Project,
    inviterId: null,
    inviter: () => User,
    invitedUserId: null,
    invitedUser: () => User,
    status: null,
    requestedRole: null,
    respondedAt: null,
    createdAt: null,
    updatedAt: null,
  };
}

export { ProjectInvitationStatus } from '@attraccess/application-models';
