import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class AssignRoleDto {
  @IsNumber()
  @ApiProperty({ description: 'ID of the role to assign', example: 1 })
  roleId!: number;
}
