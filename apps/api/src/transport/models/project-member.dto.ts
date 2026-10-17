import { ApiProperty } from '@nestjs/swagger';
import { Project } from './project.dto';
import { User } from './user.dto';
import { ProjectMemberRole } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

export class ProjectMember {
  @ApiProperty({ description: 'Unique identifier of the project member' })
  id!: number;

  @ApiProperty({ description: 'Project ID the member belongs to' })
  projectId!: number;

  @ApiProperty({ description: 'Project the member belongs to', type: () => Project })
  project!: Project;

  @ApiProperty({ description: 'User ID of the member' })
  userId!: number;

  @ApiProperty({ description: 'User that belongs to the project', type: () => User })
  user!: User;

  @ApiProperty({
    description: 'Role of the member within the project',
    enum: ProjectMemberRole,
    enumName: 'ProjectMemberRole',
  })
  role!: ProjectMemberRole;

  @ApiProperty({ description: 'When the membership started' })
  joinedAt!: Date;
  static readonly responseFields: ResponseFields = {
    id: null,
    projectId: null,
    project: () => Project,
    userId: null,
    user: () => User,
    role: null,
    joinedAt: null,
  };
}

export { ProjectMemberRole } from '@attraccess/application-models';
