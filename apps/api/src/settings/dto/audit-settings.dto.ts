import { ApiProperty, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, Max, Min } from 'class-validator';

export class AuditSettingsDto {
  @ApiProperty({ default: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ enum: ['billing', 'resource', 'wago', 'identity'], isArray: true, default: ['resource', 'wago', 'identity'] })
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(['billing', 'resource', 'wago', 'identity'], { each: true })
  domains!: Array<'billing' | 'resource' | 'wago' | 'identity'>;

  @ApiProperty({ default: 90, minimum: 1, maximum: 3650 })
  @IsInt()
  @Min(1)
  @Max(3650)
  retention_days!: number;
}

export class UpdateAuditSettingsDto extends PartialType(AuditSettingsDto) {}
