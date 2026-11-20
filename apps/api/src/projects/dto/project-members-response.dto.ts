import { ApiProperty } from '@nestjs/swagger';
import { UserDto } from '../../users-and-auth/users/dtos/user.dto';
import { ProjectMemberDto } from './project.dto';

export class ProjectMembersResponseDto {
  @ApiProperty({ type: () => UserDto })
  owner!: UserDto;

  @ApiProperty({ type: () => ProjectMemberDto, isArray: true })
  members!: ProjectMemberDto[];
}
