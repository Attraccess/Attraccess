import { AutoIntroductionTarget, ResourceType, SupervisionMode } from '@attraccess/database-entities';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import { ToBoolean, ToJson, ToNumber } from '../../common/request-transformers';
import { UpdateResourceDtoDocumentation } from './updateResourceDocumentation.dto';

export class UpdateResourceDto extends UpdateResourceDtoDocumentation {
  @ApiProperty({
    description: 'The name of the resource',
    example: '3D Printer',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'The type of the resource',
    example: ResourceType.Machine,
    enum: ResourceType,
    required: false,
    enumName: 'ResourceType',
  })
  @IsEnum(ResourceType)
  @IsOptional()
  type: ResourceType;

  @ApiProperty({
    description: '(only for doors) wheter the door needs seperate actions for unlocking and unlatching',
    example: false,
    default: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  @ToBoolean()
  separateUnlockAndUnlatch?: boolean;

  @ApiProperty({
    description: 'A detailed description of the resource',
    example: 'Prusa i3 MK3S+ 3D printer with 0.4mm nozzle',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;
  @ApiProperty({
    description: 'Custom metadata key-value pairs configured for this resource',
    required: false,
    type: Object,
    example: {
      location: 'lab-1',
      template: 'door-access',
    },
    additionalProperties: true,
  })
  @IsObject()
  @IsOptional()
  @ToJson()
  metadata?: Record<string, unknown> | null;

  @ApiProperty({
    description: 'Whether this resource allows overtaking by the next user without the prior user ending their session',
    required: false,
    example: false,
    type: Boolean,
  })
  @IsBoolean()
  @ToBoolean()
  @IsOptional()
  allowTakeOver?: boolean;

  @ApiProperty({
    description: 'Days after a user was trained before retraining is required. Null disables the age-based trigger.',
    required: false,
    nullable: true,
    example: 365,
    type: Number,
  })
  @ToNumber()
  @ValidateIf((o) => o.retrainingMaxAgeDays !== null && o.retrainingMaxAgeDays !== undefined)
  @IsInt()
  @Min(0)
  @IsOptional()
  retrainingMaxAgeDays?: number | null;

  @ApiProperty({
    description:
      'Days a user may go without using this resource before retraining is required. Null disables the inactivity trigger.',
    required: false,
    nullable: true,
    example: 180,
    type: Number,
  })
  @ToNumber()
  @ValidateIf((o) => o.retrainingMaxInactivityDays !== null && o.retrainingMaxInactivityDays !== undefined)
  @IsInt()
  @Min(0)
  @IsOptional()
  retrainingMaxInactivityDays?: number | null;

  @ApiProperty({
    description: 'Whether to block resource access once retraining is due until the user is retrained',
    required: false,
    example: false,
    type: Boolean,
  })
  @IsBoolean()
  @ToBoolean()
  @IsOptional()
  retrainingBlocksAccess?: boolean;

  @ApiProperty({
    description: 'Controls who may start a usage session on this resource',
    required: false,
    enum: SupervisionMode,
    enumName: 'SupervisionMode',
    example: SupervisionMode.INTRODUCTION_REQUIRED,
  })
  @IsEnum(SupervisionMode)
  @IsOptional()
  supervisionMode?: SupervisionMode;

  @ApiProperty({
    description:
      'Automatically create an introduction after this many supervised sessions. Null disables auto-promotion.',
    required: false,
    nullable: true,
    example: 3,
    type: Number,
  })
  @ToNumber()
  @ValidateIf((o) => o.supervisedUsagesUntilIntroduction !== null && o.supervisedUsagesUntilIntroduction !== undefined)
  @IsInt()
  @Min(1)
  @IsOptional()
  supervisedUsagesUntilIntroduction?: number | null;

  @ApiProperty({
    description: 'Target of the auto-created introduction once the supervised-usage threshold is reached',
    required: false,
    nullable: true,
    enum: AutoIntroductionTarget,
    enumName: 'AutoIntroductionTarget',
    example: AutoIntroductionTarget.RESOURCE,
  })
  @IsEnum(AutoIntroductionTarget)
  @IsOptional()
  autoIntroductionTarget?: AutoIntroductionTarget | null;

  @ApiProperty({
    description: 'The group the auto-introduction targets when autoIntroductionTarget is GROUP',
    required: false,
    nullable: true,
    example: 1,
    type: Number,
  })
  @ToNumber()
  @ValidateIf((o) => o.autoIntroductionGroupId !== null && o.autoIntroductionGroupId !== undefined)
  @IsInt()
  @Min(1)
  @IsOptional()
  autoIntroductionGroupId?: number | null;
}
