import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @ApiProperty({ description: 'Human-readable name of the role', example: 'Workshop Supervisor', maxLength: 100 })
  name!: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  @ApiProperty({
    description: 'Description of what this role allows',
    example: 'Can supervise workshop resources',
    required: false,
    maxLength: 500,
  })
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @IsOptional()
  @ApiProperty({
    description: 'Permission keys granted by this role',
    example: ['resources.read', 'resources.update'],
    required: false,
    type: [String],
  })
  permissionKeys?: string[];
}
