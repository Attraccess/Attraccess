import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import {
  RESOURCE_ACTIVITY_VISIBILITY_VALUES,
  RESOURCE_LIST_VISIBILITY_VALUES,
  ResourceActivityVisibility,
  ResourceListVisibility,
} from '../constants';

export class UpdateResourceVisibilitySettingsDto {
  @ApiPropertyOptional({
    enum: RESOURCE_ACTIVITY_VISIBILITY_VALUES,
    enumName: 'ResourceActivityVisibility',
    description: 'Who may see which resources are in use and by whom (see ResourceVisibilitySettingsDto)',
  })
  @IsOptional()
  @IsIn(RESOURCE_ACTIVITY_VISIBILITY_VALUES)
  activityVisibility?: ResourceActivityVisibility;

  @ApiPropertyOptional({
    enum: RESOURCE_LIST_VISIBILITY_VALUES,
    enumName: 'ResourceListVisibility',
    description: 'Who may see the machine list (see ResourceVisibilitySettingsDto)',
  })
  @IsOptional()
  @IsIn(RESOURCE_LIST_VISIBILITY_VALUES)
  listVisibility?: ResourceListVisibility;
}
