import { ProjectInvitationStatus, ProjectMemberRole } from '@attraccess/application-models';
import { ApiProperty } from '@nestjs/swagger';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from './project';
import { User } from './user.entity';

@Entity('project_invitations')
// The released SQLite schema checked both value sets; a new enum value needs a migration that widens these checks.
@Check('CHK_project_invitations_status', `"status" IN ('pending', 'accepted', 'declined', 'canceled')`)
@Check('CHK_project_invitations_requested_role', `"requestedRole" IN ('viewer')`)
@Index('IDX_project_invitation_unique_by_user_and_status', ['invitedUserId', 'status'])
export class ProjectInvitation {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'Unique identifier of the project invitation' })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'Project ID for which the invitation was created' })
  projectId!: number;

  @ManyToOne(() => Project, (project) => project.invitations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  @ApiProperty({ description: 'Project for which the invitation was created', type: () => Project })
  project!: Project;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'User ID that created the invitation' })
  inviterId!: number;

  @ManyToOne(() => User, (user) => user.sentProjectInvitations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inviterId' })
  @ApiProperty({ description: 'Inviter user', type: () => User })
  inviter!: User;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'User ID that is being invited' })
  invitedUserId!: number;

  @ManyToOne(() => User, (user) => user.receivedProjectInvitations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invitedUserId' })
  @ApiProperty({ description: 'Invited user', type: () => User })
  invitedUser!: User;

  @Column({ type: 'text', enum: ProjectInvitationStatus, default: ProjectInvitationStatus.PENDING })
  @ApiProperty({
    description: 'Current status of the invitation',
    enum: ProjectInvitationStatus,
    enumName: 'ProjectInvitationStatus',
  })
  status!: ProjectInvitationStatus;

  @Column({ type: 'text', enum: ProjectMemberRole, default: ProjectMemberRole.VIEWER })
  @ApiProperty({
    description: 'Role that should be granted upon acceptance',
    enum: ProjectMemberRole,
    enumName: 'ProjectMemberRole',
  })
  requestedRole!: ProjectMemberRole;

  @Column({ type: 'timestamptz', nullable: true })
  @ApiProperty({
    description: 'Timestamp when the invitation was responded to (accept/decline/cancel)',
    required: false,
  })
  respondedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  @ApiProperty({ description: 'When the invitation was created' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @ApiProperty({ description: 'When the invitation was last updated' })
  updatedAt!: Date;
}
