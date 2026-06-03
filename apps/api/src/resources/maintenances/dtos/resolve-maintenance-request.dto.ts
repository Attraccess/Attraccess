import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum ResolveMaintenanceRequestAction {
  CONVERT = 'convert',
  DISMISS = 'dismiss',
}

export class ResolveMaintenanceRequestDto {
  @ApiProperty({
    description:
      "How to resolve the request: 'convert' starts an instant maintenance from it, 'dismiss' closes it without action",
    enum: ResolveMaintenanceRequestAction,
    example: ResolveMaintenanceRequestAction.CONVERT,
  })
  @IsEnum(ResolveMaintenanceRequestAction)
  action: ResolveMaintenanceRequestAction;

  @ApiProperty({
    description: 'Optional reason override for the maintenance when converting',
    required: false,
    maxLength: 2000,
  })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  reason?: string;
}
