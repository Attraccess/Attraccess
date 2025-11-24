import { ApiProperty } from '@nestjs/swagger';
import { ProjectMemberRole } from '@attraccess/database-entities';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class CreateProjectInvitationDto {
  @ApiProperty({ description: 'ID of the existing user to invite' })
  @IsInt()
  @Min(1)
  invitedUserId!: number;

  @ApiProperty({
    description: 'Role the invited user should receive upon acceptance',
    enum: ProjectMemberRole,
    default: ProjectMemberRole.VIEWER,
    required: false,
  })
  @IsEnum(ProjectMemberRole)
  @IsOptional()
  role?: ProjectMemberRole;
}
