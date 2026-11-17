import { ApiProperty } from '@nestjs/swagger';
import { ResourceIntroducerType, type ResourceIntroducerRecord } from '@attraccess/application-models';
import { ResourceActorUserDto } from '../../maintenances/dtos/resource-actor-user.dto';
import { toActorUserDto } from '../../maintenances/dtos/maintenance-records.mapper';

/*
 * Response shape of the introducer endpoints. The class name is the OpenAPI schema name the generated client and
 * the frontend already use, so it stays what the former entity response was called.
 */
export class ResourceIntroducer {
  @ApiProperty({ description: 'The unique identifier of the introduction permission', example: 1 })
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

  @ApiProperty({ description: 'The ID of the user who can give introductions', example: 1 })
  userId!: number;

  @ApiProperty({
    description: 'The ID of the resource group (if permission is for a group)',
    example: 1,
    required: false,
  })
  resourceGroupId!: number | null;

  @ApiProperty({ description: 'When the permission was granted' })
  grantedAt!: Date;

  @ApiProperty({ description: 'The user who can give introductions', type: () => ResourceActorUserDto })
  user?: ResourceActorUserDto | null;
}

export function toResourceIntroducerDto(record: ResourceIntroducerRecord): ResourceIntroducer {
  const dto: ResourceIntroducer = {
    id: record.id,
    type: record.type,
    resourceId: record.resourceId,
    userId: record.userId,
    resourceGroupId: record.resourceGroupId,
    grantedAt: record.grantedAt,
  };
  if (record.user !== undefined) dto.user = toActorUserDto(record.user);
  return dto;
}
