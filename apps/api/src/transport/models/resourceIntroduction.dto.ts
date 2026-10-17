import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.dto';
import { User } from './user.dto';
import { ResourceIntroductionHistoryItem } from './resourceIntroductionHistoryItem.dto';
import { ResourceGroup } from './resourceGroup.dto';
import type { ResponseFields } from '../response-mapper';

export class ResourceIntroduction {
  @ApiProperty({
    description: 'The unique identifier of the introduction',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'The ID of the resource (if this is a resource-specific introduction)',
    example: 1,
    required: false,
  })
  resourceId!: number | null;

  @ApiProperty({
    description: 'The ID of the user who received the introduction',
    example: 1,
  })
  receiverUserId!: number;

  @ApiProperty({
    description: 'The ID of the user who tutored the receiver',
    example: 2,
  })
  tutorUserId!: number;

  @ApiProperty({
    description: 'The ID of the resource group (if this is a group-level introduction)',
    example: 1,
    required: false,
  })
  resourceGroupId!: number | null;

  @ApiProperty({
    description: 'When the introduction was completed',
    example: '2021-01-01T00:00:00.000Z',
  })
  completedAt!: Date;

  @ApiProperty({
    description: 'When the user was last notified that retraining is due (used to avoid repeat notifications)',
    example: '2021-01-01T00:00:00.000Z',
    required: false,
    nullable: true,
  })
  retrainingNotifiedAt!: Date | null;

  retrainingRequiredAuditedAt!: Date | null;

  @ApiProperty({
    description: 'When the introduction record was created',
    example: '2021-01-01T00:00:00.000Z',
  })
  createdAt!: Date;

  resource!: Resource;

  @ApiProperty({
    description: 'The user who received the introduction',
    type: () => User,
  })
  receiverUser!: User;

  @ApiProperty({
    description: 'The user who tutored the receiver',
    type: () => User,
  })
  tutorUser!: User;

  @ApiProperty({
    description: 'History of revoke/unrevoke actions for this introduction',
    type: () => [ResourceIntroductionHistoryItem],
  })
  history!: ResourceIntroductionHistoryItem[];

  @ApiProperty({ description: 'The group providing this introduction', type: () => ResourceGroup, required: false })
  resourceGroup!: ResourceGroup;
  static readonly responseFields: ResponseFields = {
    id: null,
    resourceId: null,
    receiverUserId: null,
    tutorUserId: null,
    resourceGroupId: null,
    completedAt: null,
    retrainingNotifiedAt: null,
    retrainingRequiredAuditedAt: null,
    createdAt: null,
    resource: () => Resource,
    receiverUser: () => User,
    tutorUser: () => User,
    history: () => ResourceIntroductionHistoryItem,
    resourceGroup: () => ResourceGroup,
  };
}
