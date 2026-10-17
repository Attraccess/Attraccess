import type { ResponseFields } from '../../transport/response-mapper';
import { ApiProperty } from '@nestjs/swagger';
import { Project } from '../../transport/models/project.dto';
import { ProjectMemberRole } from '@attraccess/application-models';

export class ProjectAccessInfoDto {
  static readonly responseFields: ResponseFields = { isOwner: null, role: null, canManageProject: null };
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

export class ProjectWithAccessDto extends Project {
  static readonly responseFields: ResponseFields = { ...Project.responseFields, access: () => ProjectAccessInfoDto };
  @ApiProperty({ type: ProjectAccessInfoDto })
  access!: ProjectAccessInfoDto;
}
