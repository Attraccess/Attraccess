import { ApiProperty } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Project } from './project';
import { User } from './user.entity';

export enum ProjectMemberRole {
  VIEWER = 'viewer',
}

@Entity('project_members')
@Unique(['projectId', 'userId'])
export class ProjectMember {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'Unique identifier of the project member' })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'Project ID the member belongs to' })
  projectId!: number;

  @ManyToOne(() => Project, (project) => project.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  @ApiProperty({ description: 'Project the member belongs to', type: () => Project })
  project!: Project;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'User ID of the member' })
  userId!: number;

  @ManyToOne(() => User, (user) => user.projectMemberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  @ApiProperty({ description: 'User that belongs to the project', type: () => User })
  user!: User;

  @Column({ type: 'text', enum: ProjectMemberRole, default: ProjectMemberRole.VIEWER })
  @ApiProperty({ description: 'Role of the member within the project', enum: ProjectMemberRole })
  role!: ProjectMemberRole;

  @CreateDateColumn()
  @ApiProperty({ description: 'When the membership started' })
  joinedAt!: Date;
}
