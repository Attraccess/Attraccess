import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional } from 'class-validator';
import { ToBoolean } from '../../../common/request-transformers';

/** Body of the extension of a running session. Give `extendByMinutes` or `toMax`. */
export class ExtendUsageSessionDto {
  @ApiProperty({
    description:
      'Id of the session to extend. If omitted, your own session is extended (as when ending a session without an id).',
    required: false,
    type: Number,
  })
  @IsInt()
  @IsOptional()
  usageId?: number;

  @ApiProperty({
    description:
      'Minutes to add to the automatic end: 60, 120, 240, 360, 720 or 1440. Refused with 400 SESSION_EXTENSION_EXCEEDS_MAXIMUM when the session would end later than the maximum session time allows; nothing is clipped.',
    required: false,
    enum: [60, 120, 240, 360, 720, 1440],
    example: 60,
    type: Number,
  })
  @IsInt()
  @IsOptional()
  extendByMinutes?: number;

  @ApiProperty({
    description:
      'Extend to the latest end the maximum session time allows (start plus the maximum). Only for machines that have a maximum; use instead of extendByMinutes.',
    required: false,
    example: false,
    type: Boolean,
  })
  @IsBoolean()
  @ToBoolean()
  @IsOptional()
  toMax?: boolean;
}
