import { ApiProperty } from '@nestjs/swagger';
import type { RoleWithUserCount } from '@attraccess/application-models';
import { RoleDto, toRoleDto } from './role.dto';

export class RoleWithUsageDto extends RoleDto {
  @ApiProperty({ description: 'Number of users currently assigned to this role', example: 3 })
  userCount!: number;
}

export function toRoleWithUsageDto(role: RoleWithUserCount): RoleWithUsageDto {
  return { ...toRoleDto(role), userCount: role.userCount };
}
