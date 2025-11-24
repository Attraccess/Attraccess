import { ApiProperty } from '@nestjs/swagger';
import {
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
import { ProjectMemberRole } from './project-member.entity';

export enum ProjectInvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  CANCELED = 'canceled',
}

@Entity('project_invitations')
@Index(['invitedUserId', 'status'])
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
  @ApiProperty({ description: 'Current status of the invitation', enum: ProjectInvitationStatus })
  status!: ProjectInvitationStatus;

  @Column({ type: 'text', enum: ProjectMemberRole, default: ProjectMemberRole.VIEWER })
  @ApiProperty({ description: 'Role that should be granted upon acceptance', enum: ProjectMemberRole })
  requestedRole!: ProjectMemberRole;

  @Column({ type: 'datetime', nullable: true })
  @ApiProperty({
    description: 'Timestamp when the invitation was responded to (accept/decline/cancel)',
    required: false,
  })
  respondedAt!: Date | null;

  @CreateDateColumn()
  @ApiProperty({ description: 'When the invitation was created' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ description: 'When the invitation was last updated' })
  updatedAt!: Date;
}
