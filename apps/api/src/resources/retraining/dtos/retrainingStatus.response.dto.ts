import { ApiProperty } from '@nestjs/swagger';

export class RetrainingStatusResponseDto {
  @ApiProperty({
    description: 'Whether the current user has any introduction granting access to this resource',
    type: Boolean,
  })
  hasIntroduction!: boolean;

  @ApiProperty({
    description: 'Whether a retraining policy applies to the current user for this resource',
    type: Boolean,
  })
  applies!: boolean;

  @ApiProperty({
    description: 'Whether retraining is currently due for the current user',
    type: Boolean,
  })
  isDue!: boolean;

  @ApiProperty({
    description: 'Whether access is blocked because retraining is due',
    type: Boolean,
  })
  blocksAccess!: boolean;

  @ApiProperty({
    description: 'When retraining becomes (or became) due',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  dueAt!: string | null;

  @ApiProperty({
    description: 'Which trigger drives the retraining requirement',
    enum: ['age', 'inactivity'],
    enumName: 'RetrainingReason',
    nullable: true,
  })
  reason!: 'age' | 'inactivity' | null;
}
