import { ApiProperty } from '@nestjs/swagger';
import {
  RESOURCE_ACTIVITY_VISIBILITY_VALUES,
  RESOURCE_LIST_VISIBILITY_VALUES,
  ResourceActivityVisibility,
  ResourceListVisibility,
} from '../constants';

export class ResourceVisibilitySettingsDto {
  @ApiProperty({
    description:
      'Who may see which resources are in use and by whom. "all": everyone with resources.read. "introduced": only people who may use the resource, its introducers and maintainers, and holders of resources.update or resources.access.manage. People always see their own sessions.',
    enum: RESOURCE_ACTIVITY_VISIBILITY_VALUES,
    enumName: 'ResourceActivityVisibility',
    default: 'all',
  })
  activityVisibility!: ResourceActivityVisibility;

  @ApiProperty({
    description:
      'Who may see the machine list. "authenticated": every signed-in account with resources.read sees all machines. "permitted-only": only machines the account is introduced to (directly or through a group), introduces or maintains, or currently uses; holders of resources.update or resources.access.manage always see all. Accounts without resources.read get the permitted-only view in both modes. A hidden machine answers 404. Fresh installs default to "permitted-only"; upgraded instances keep "authenticated".',
    enum: RESOURCE_LIST_VISIBILITY_VALUES,
    enumName: 'ResourceListVisibility',
    default: 'permitted-only',
  })
  listVisibility!: ResourceListVisibility;
}
