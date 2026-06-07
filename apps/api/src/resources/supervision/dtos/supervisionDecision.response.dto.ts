import { ApiProperty } from '@nestjs/swagger';

/**
 * Result of a supervisor decision that does not start a session (currently: rejection).
 */
export class SupervisionDecisionResponseDto {
  @ApiProperty({ description: 'The outcome of the decision', example: 'rejected', enum: ['rejected'] })
  status!: 'rejected';

  @ApiProperty({ description: 'The supervision request the decision applies to' })
  requestId!: string;
}
