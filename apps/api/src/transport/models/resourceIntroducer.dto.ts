import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.dto';
import { User } from './user.dto';
import { ResourceGroup } from './resourceGroup.dto';
import { ResourceIntroducerType } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

export class ResourceIntroducer {
  @ApiProperty({
    description: 'The unique identifier of the introduction permission',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description:
      "The kind of access: 'introducer' can give introductions and do maintenance; 'maintainer' can only do maintenance and control the machine",
    enum: ResourceIntroducerType,
    example: ResourceIntroducerType.INTRODUCER,
    enumName: 'ResourceIntroducerType',
  })
  type!: ResourceIntroducerType;

  @ApiProperty({
    description: 'The ID of the resource (if permission is for a specific resource)',
    example: 1,
    required: false,
  })
  resourceId!: number | null;

  @ApiProperty({
    description: 'The ID of the user who can give introductions',
    example: 1,
  })
  userId!: number;

  @ApiProperty({
    description: 'The ID of the resource group (if permission is for a group)',
    example: 1,
    required: false,
  })
  resourceGroupId!: number | null;

  @ApiProperty({
    description: 'When the permission was granted',
  })
  grantedAt!: Date;

  resource!: Resource | null;

  @ApiProperty({
    description: 'The user who can give introductions',
    type: () => User,
  })
  user!: User;

  resourceGroup!: ResourceGroup | null;
  static readonly responseFields: ResponseFields = {
    id: null,
    type: null,
    resourceId: null,
    userId: null,
    resourceGroupId: null,
    grantedAt: null,
    resource: () => Resource,
    user: () => User,
    resourceGroup: () => ResourceGroup,
  };
}

export { ResourceIntroducerType } from '@attraccess/application-models';
