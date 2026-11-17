import { ApiProperty } from '@nestjs/swagger';
import {
  IntroductionHistoryAction,
  type IntroductionHistoryRecord,
  type IntroductionRecord,
} from '@attraccess/application-models';
import { ResourceActorUserDto } from '../../maintenances/dtos/resource-actor-user.dto';
import { toActorUserDto } from '../../maintenances/dtos/maintenance-records.mapper';
import { ResourceGroup, toResourceGroupDto } from '../../groups/dto/resource-group.dto';

/*
 * Response shapes of the introduction endpoints. The class names are the OpenAPI schema names the generated client
 * and the frontend already use, so they stay what the former entity responses were called.
 */
export class ResourceIntroductionHistoryItem {
  @ApiProperty({ description: 'The unique identifier of the introduction history entry', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The ID of the related introduction', example: 1 })
  introductionId!: number;

  @ApiProperty({
    description: 'The action performed (revoke or grant)',
    enum: IntroductionHistoryAction,
    example: IntroductionHistoryAction.REVOKE,
    enumName: 'IntroductionHistoryAction',
  })
  action!: IntroductionHistoryAction;

  @ApiProperty({ description: 'The ID of the user who performed the action', example: 1 })
  performedByUserId!: number;

  @ApiProperty({
    description: 'Optional comment explaining the reason for the action',
    example: 'User no longer requires access to this resource',
    required: false,
  })
  comment!: string | null;

  @ApiProperty({ description: 'When the action was performed', example: '2021-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'The user who performed the action', type: () => ResourceActorUserDto })
  performedByUser?: ResourceActorUserDto | null;
}

export class ResourceIntroduction {
  @ApiProperty({ description: 'The unique identifier of the introduction', example: 1 })
  id!: number;

  @ApiProperty({
    description: 'The ID of the resource (if this is a resource-specific introduction)',
    example: 1,
    required: false,
  })
  resourceId!: number | null;

  @ApiProperty({ description: 'The ID of the user who received the introduction', example: 1 })
  receiverUserId!: number;

  @ApiProperty({ description: 'The ID of the user who tutored the receiver', example: 2 })
  tutorUserId!: number | null;

  @ApiProperty({
    description: 'The ID of the resource group (if this is a group-level introduction)',
    example: 1,
    required: false,
  })
  resourceGroupId!: number | null;

  @ApiProperty({ description: 'When the introduction was completed', example: '2021-01-01T00:00:00.000Z' })
  completedAt!: Date;

  @ApiProperty({
    description: 'When the user was last notified that retraining is due (used to avoid repeat notifications)',
    example: '2021-01-01T00:00:00.000Z',
    required: false,
    nullable: true,
  })
  retrainingNotifiedAt!: Date | null;

  /** Part of the response, but not of the documented schema. */
  retrainingRequiredAuditedAt!: Date | null;

  @ApiProperty({ description: 'When the introduction record was created', example: '2021-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'The user who received the introduction', type: () => ResourceActorUserDto })
  receiverUser?: ResourceActorUserDto | null;

  @ApiProperty({ description: 'The user who tutored the receiver', type: () => ResourceActorUserDto })
  tutorUser?: ResourceActorUserDto | null;

  @ApiProperty({
    description: 'History of revoke/unrevoke actions for this introduction',
    type: () => [ResourceIntroductionHistoryItem],
  })
  history?: ResourceIntroductionHistoryItem[];

  @ApiProperty({ description: 'The group providing this introduction', type: () => ResourceGroup, required: false })
  resourceGroup?: ResourceGroup | null;
}

export function toIntroductionHistoryDto(record: IntroductionHistoryRecord): ResourceIntroductionHistoryItem {
  const dto: ResourceIntroductionHistoryItem = {
    id: record.id,
    introductionId: record.introductionId,
    action: record.action,
    performedByUserId: record.performedByUserId,
    comment: record.comment,
    createdAt: record.createdAt,
  };
  if (record.performedByUser !== undefined) dto.performedByUser = toActorUserDto(record.performedByUser);
  return dto;
}

export function toIntroductionDto(record: IntroductionRecord): ResourceIntroduction {
  const dto: ResourceIntroduction = {
    id: record.id,
    resourceId: record.resourceId,
    receiverUserId: record.receiverUserId,
    tutorUserId: record.tutorUserId,
    resourceGroupId: record.resourceGroupId,
    completedAt: record.completedAt,
    retrainingNotifiedAt: record.retrainingNotifiedAt,
    retrainingRequiredAuditedAt: record.retrainingRequiredAuditedAt,
    createdAt: record.createdAt,
  };
  if (record.receiverUser !== undefined) dto.receiverUser = toActorUserDto(record.receiverUser);
  if (record.tutorUser !== undefined) dto.tutorUser = toActorUserDto(record.tutorUser);
  if (record.history !== undefined) dto.history = record.history.map(toIntroductionHistoryDto);
  if (record.resourceGroup !== undefined) {
    dto.resourceGroup = record.resourceGroup ? toResourceGroupDto(record.resourceGroup) : null;
  }
  return dto;
}
