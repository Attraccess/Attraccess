import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { RESOURCE_ACTIVITY_VISIBILITY_VALUES, ResourceActivityVisibility } from '../constants';

export class UpdateResourceVisibilitySettingsDto {
  @ApiPropertyOptional({
    enum: RESOURCE_ACTIVITY_VISIBILITY_VALUES,
    enumName: 'ResourceActivityVisibility',
    description: 'Who may see which resources are in use and by whom (see ResourceVisibilitySettingsDto)',
  })
  @IsOptional()
  @IsIn(RESOURCE_ACTIVITY_VISIBILITY_VALUES)
  activityVisibility?: ResourceActivityVisibility;
}
