import { ApiProperty } from '@nestjs/swagger';
import { ProjectMember } from '../../transport/models/project-member.dto';
import { User } from '../../transport/models/user.dto';

export class ProjectMembersResponseDto {
  @ApiProperty({ type: () => User })
  owner!: User;

  @ApiProperty({ type: () => ProjectMember, isArray: true })
  members!: ProjectMember[];
}
