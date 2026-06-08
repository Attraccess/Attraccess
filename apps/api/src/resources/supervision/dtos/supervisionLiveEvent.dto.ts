import { ApiProperty } from '@nestjs/swagger';
import { SupervisionRequestDto } from './supervisionRequest.dto';

export enum SupervisionLiveEventType {
  /** A new supervision request is awaiting the supervisor. */
  REQUESTED = 'requested',
  /** A request lapsed after 30s without a response. */
  EXPIRED = 'expired',
  /** A request was approved and the session started. */
  RESOLVED = 'resolved',
  /** A request was rejected by the supervisor. */
  REJECTED = 'rejected',
}

/**
 * Realtime event delivered to a supervisor over SSE.
 */
export class SupervisionLiveEventDto {
  @ApiProperty({ enum: SupervisionLiveEventType, enumName: 'SupervisionLiveEventType' })
  type!: SupervisionLiveEventType;

  @ApiProperty({ description: 'The supervision request this event refers to' })
  requestId!: string;

  @ApiProperty({
    description: 'The full request payload (present for REQUESTED events, null otherwise)',
    required: false,
    nullable: true,
    type: () => SupervisionRequestDto,
  })
  request!: SupervisionRequestDto | null;
}
