import { ApiProperty, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, Max, Min } from 'class-validator';

export class AuditSettingsDto {
  @ApiProperty({ default: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    enum: ['administration', 'project', 'billing', 'resource', 'wago', 'identity'],
    isArray: true,
    default: ['administration', 'project', 'resource', 'wago', 'identity'],
  })
  @IsArray()
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsIn(['administration', 'project', 'billing', 'resource', 'wago', 'identity'], { each: true })
  domains!: Array<'administration' | 'project' | 'billing' | 'resource' | 'wago' | 'identity'>;

  @ApiProperty({ default: 90, minimum: 1, maximum: 3650 })
  @IsInt()
  @Min(1)
  @Max(3650)
  retention_days!: number;
}

export class UpdateAuditSettingsDto extends PartialType(AuditSettingsDto) {}
