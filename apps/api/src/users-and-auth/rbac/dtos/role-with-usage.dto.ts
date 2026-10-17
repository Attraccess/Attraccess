import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../transport/models/role.dto';

export class RoleWithUsageDto extends Role {
  @ApiProperty({ description: 'Number of users currently assigned to this role', example: 3 })
  userCount!: number;
}
