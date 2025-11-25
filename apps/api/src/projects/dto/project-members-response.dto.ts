import { ApiProperty } from '@nestjs/swagger';
import { ProjectMember, User } from '@attraccess/database-entities';

export class ProjectMembersResponseDto {
  @ApiProperty({ type: () => User })
  owner!: User;

  @ApiProperty({ type: () => ProjectMember, isArray: true })
  members!: ProjectMember[];
}
