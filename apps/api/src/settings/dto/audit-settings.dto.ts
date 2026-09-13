import { ApiProperty, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, Max, Min } from 'class-validator';

export class AuditSettingsDto {
  @ApiProperty({ default: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    enum: ['administration', 'billing', 'resource', 'wago'],
    isArray: true,
    default: ['administration', 'resource', 'wago'],
  })
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(['administration', 'billing', 'resource', 'wago'], { each: true })
  domains!: ('administration' | 'billing' | 'resource' | 'wago')[];

  @ApiProperty({ default: 90, minimum: 1, maximum: 3650 })
  @IsInt()
  @Min(1)
  @Max(3650)
  retention_days!: number;
}

export class UpdateAuditSettingsDto extends PartialType(AuditSettingsDto) {}
