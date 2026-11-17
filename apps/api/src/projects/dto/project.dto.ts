import {
  ProjectInvitationStatus,
  ProjectMemberRole,
  type ProjectInvitationRecord,
  type ProjectMemberRecord,
  type ProjectRecord,
} from '@attraccess/application-models';
import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { UserDto, toUserDto } from '../../users-and-auth/users/dtos/user.dto';

@ApiSchema({ name: 'Project' })
export class ProjectDto {
  @ApiProperty({ description: 'The ID of the project' })
  id!: number;

  @ApiProperty({ description: 'The date and time the NFC card was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'The date and time the NFC card was last updated' })
  updatedAt!: Date;

  @ApiProperty({ description: 'The date and time the project was archived', required: false, nullable: true })
  archivedAt!: Date | null;

  @ApiProperty({ description: 'The ID of the user that owns the project', type: () => UserDto })
  owner!: UserDto;

  @ApiProperty({ description: 'The name of the project' })
  name!: string;

  @ApiProperty({ description: 'The description of the project' })
  description!: string | null;

  @ApiProperty({ description: 'The logo of the project' })
  logo!: string | null;

  @ApiProperty({ description: 'Members that have access to the project', type: () => [ProjectMemberDto] })
  members?: ProjectMemberDto[];

  @ApiProperty({ description: 'Pending invitations for the project', type: () => [ProjectInvitationDto] })
  invitations?: ProjectInvitationDto[];
}

@ApiSchema({ name: 'ProjectMember' })
export class ProjectMemberDto {
  @ApiProperty({ description: 'Unique identifier of the project member' })
  id!: number;

  @ApiProperty({ description: 'Project ID the member belongs to' })
  projectId!: number;

  @ApiProperty({ description: 'Project the member belongs to', type: () => ProjectDto })
  project?: ProjectDto;

  @ApiProperty({ description: 'User ID of the member' })
  userId!: number;

  @ApiProperty({ description: 'User that belongs to the project', type: () => UserDto })
  user?: UserDto;

  @ApiProperty({
    description: 'Role of the member within the project',
    enum: ProjectMemberRole,
    enumName: 'ProjectMemberRole',
  })
  role!: ProjectMemberRole;

  @ApiProperty({ description: 'When the membership started' })
  joinedAt!: Date;
}

@ApiSchema({ name: 'ProjectInvitation' })
export class ProjectInvitationDto {
  @ApiProperty({ description: 'Unique identifier of the project invitation' })
  id!: number;

  @ApiProperty({ description: 'Project ID for which the invitation was created' })
  projectId!: number;

  @ApiProperty({ description: 'Project for which the invitation was created', type: () => ProjectDto })
  project?: ProjectDto;

  @ApiProperty({ description: 'User ID that created the invitation' })
  inviterId!: number;

  @ApiProperty({ description: 'Inviter user', type: () => UserDto })
  inviter?: UserDto;

  @ApiProperty({ description: 'User ID that is being invited' })
  invitedUserId!: number;

  @ApiProperty({ description: 'Invited user', type: () => UserDto })
  invitedUser?: UserDto;

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
}

export function toProjectDto(project: ProjectRecord): ProjectDto {
  return {
    id: project.id,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    archivedAt: project.archivedAt,
    ...(project.owner ? { owner: toUserDto(project.owner) } : {}),
    name: project.name,
    description: project.description,
    logo: project.logo,
  } as ProjectDto;
}

export function toProjectMemberDto(member: ProjectMemberRecord): ProjectMemberDto {
  return {
    id: member.id,
    projectId: member.projectId,
    userId: member.userId,
    role: member.role,
    joinedAt: member.joinedAt,
    ...(member.user ? { user: toUserDto(member.user) } : {}),
  };
}

export function toProjectInvitationDto(invitation: ProjectInvitationRecord): ProjectInvitationDto {
  return {
    id: invitation.id,
    projectId: invitation.projectId,
    inviterId: invitation.inviterId,
    invitedUserId: invitation.invitedUserId,
    status: invitation.status,
    requestedRole: invitation.requestedRole,
    respondedAt: invitation.respondedAt,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
    ...(invitation.project ? { project: toProjectDto(invitation.project) } : {}),
    ...(invitation.inviter ? { inviter: toUserDto(invitation.inviter) } : {}),
    ...(invitation.invitedUser ? { invitedUser: toUserDto(invitation.invitedUser) } : {}),
  };
}
