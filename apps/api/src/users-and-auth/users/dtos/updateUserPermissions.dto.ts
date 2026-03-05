import { ApiProperty } from '@nestjs/swagger';
import { ToBoolean } from '../../../common/request-transformers';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateUserPermissionsDto {
  @ApiProperty({
    description: 'Whether the user can manage resources',
    example: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  @ToBoolean()
  canManageResources?: boolean;

  @ApiProperty({
    description: 'Whether the user can manage system configuration',
    example: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  canManageSystemConfiguration?: boolean;

  @ApiProperty({
    description: 'Whether the user can manage users',
    example: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  canManageUsers?: boolean;

  @ApiProperty({
    description: 'Whether the user can manage billing',
    example: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  canManageBilling?: boolean;
}
