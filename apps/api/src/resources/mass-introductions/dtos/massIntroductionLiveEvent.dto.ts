import { ApiProperty } from '@nestjs/swagger';
import { MassIntroductionSessionDto } from './massIntroductionSession.dto';

export enum MassIntroductionLiveEventType {
  /** A participant joined or the reader state changed. */
  UPDATED = 'updated',
  /** The session expired or was cancelled. */
  ENDED = 'ended',
}

export enum MassIntroductionEndReason {
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  /** The introducer lost the right to introduce to the target. */
  REVOKED = 'revoked',
}

/** Realtime event delivered to the introducer who owns the session. */
export class MassIntroductionLiveEventDto {
  @ApiProperty({ enum: MassIntroductionLiveEventType, enumName: 'MassIntroductionLiveEventType' })
  type!: MassIntroductionLiveEventType;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: () => MassIntroductionSessionDto, nullable: true, required: false })
  session?: MassIntroductionSessionDto | null;

  @ApiProperty({ enum: MassIntroductionEndReason, enumName: 'MassIntroductionEndReason', required: false })
  reason?: MassIntroductionEndReason;
}
