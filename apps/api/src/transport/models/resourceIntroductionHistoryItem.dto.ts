import { ApiProperty } from '@nestjs/swagger';
import { ResourceIntroduction } from './resourceIntroduction.dto';
import { User } from './user.dto';
import { IntroductionHistoryAction } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

export class ResourceIntroductionHistoryItem {
  @ApiProperty({
    description: 'The unique identifier of the introduction history entry',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'The ID of the related introduction',
    example: 1,
  })
  introductionId!: number;

  @ApiProperty({
    description: 'The action performed (revoke or grant)',
    enum: IntroductionHistoryAction,
    example: IntroductionHistoryAction.REVOKE,
    enumName: 'IntroductionHistoryAction',
  })
  action!: IntroductionHistoryAction;

  @ApiProperty({
    description: 'The ID of the user who performed the action',
    example: 1,
  })
  performedByUserId!: number;

  @ApiProperty({
    description: 'Optional comment explaining the reason for the action',
    example: 'User no longer requires access to this resource',
    required: false,
  })
  comment!: string | null;

  @ApiProperty({
    description: 'When the action was performed',
    example: '2021-01-01T00:00:00.000Z',
  })
  createdAt!: Date;

  introduction!: ResourceIntroduction;

  @ApiProperty({
    description: 'The user who performed the action',
    type: () => User,
  })
  performedByUser!: User;
  static readonly responseFields: ResponseFields = {
    id: null,
    introductionId: null,
    action: null,
    performedByUserId: null,
    comment: null,
    createdAt: null,
    introduction: () => ResourceIntroduction,
    performedByUser: () => User,
  };
}

export { IntroductionHistoryAction } from '@attraccess/application-models';
