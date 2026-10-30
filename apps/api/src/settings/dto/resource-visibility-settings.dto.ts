import { ApiProperty } from '@nestjs/swagger';
import { RESOURCE_ACTIVITY_VISIBILITY_VALUES, ResourceActivityVisibility } from '../constants';

export class ResourceVisibilitySettingsDto {
  @ApiProperty({
    description:
      'Who may see which equipment is in use and by whom. "all": everyone with "view resources". "introduced": only people who may use the machine, its introducers and maintainers, and managers. People always see their own sessions.',
    enum: RESOURCE_ACTIVITY_VISIBILITY_VALUES,
    enumName: 'ResourceActivityVisibility',
    default: 'all',
  })
  activityVisibility!: ResourceActivityVisibility;
}
