import { ApiProperty } from '@nestjs/swagger';
import { Project, ProjectMemberRole } from '@attraccess/database-entities';

export class ProjectAccessInfoDto {
  @ApiProperty({ description: 'Whether the authenticated user owns the project' })
  isOwner!: boolean;

  @ApiProperty({
    description: 'Role of the authenticated user inside the project when they are a member',
    enum: ProjectMemberRole,
    nullable: true,
    required: false,
  })
  role!: ProjectMemberRole | null;

  @ApiProperty({ description: 'Whether the authenticated user can manage the project' })
  canManageProject!: boolean;
}

export class ProjectWithAccessDto extends Project {
  @ApiProperty({ type: ProjectAccessInfoDto })
  access!: ProjectAccessInfoDto;
}
