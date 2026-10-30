import { ApiProperty } from '@nestjs/swagger';
import { RESOURCE_ACTIVITY_VISIBILITY_VALUES, ResourceActivityVisibility } from '../constants';

export class ResourceVisibilitySettingsDto {
  @ApiProperty({
    description:
      'Who may see which resources are in use and by whom. "all": everyone with resources.read. "introduced": only people who may use the resource, its introducers and maintainers, and holders of resources.update or resources.access.manage. People always see their own sessions.',
    enum: RESOURCE_ACTIVITY_VISIBILITY_VALUES,
    enumName: 'ResourceActivityVisibility',
    default: 'all',
  })
  activityVisibility!: ResourceActivityVisibility;
}
