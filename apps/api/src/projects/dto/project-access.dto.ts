import { ApiProperty } from '@nestjs/swagger';
import { ProjectDto } from './project.dto';
import { ProjectMemberRole } from '@attraccess/application-models';

export class ProjectAccessInfoDto {
  @ApiProperty({ description: 'Whether the authenticated user owns the project' })
  isOwner!: boolean;

  @ApiProperty({
    description: 'Role of the authenticated user inside the project when they are a member',
    enum: ProjectMemberRole,
    nullable: true,
    required: false,
    enumName: 'ProjectMemberRole',
  })
  role!: ProjectMemberRole | null;

  @ApiProperty({ description: 'Whether the authenticated user can manage the project' })
  canManageProject!: boolean;
}

export class ProjectWithAccessDto extends ProjectDto {
  @ApiProperty({ type: ProjectAccessInfoDto })
  access!: ProjectAccessInfoDto;
}
