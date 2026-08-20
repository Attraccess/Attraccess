import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive } from 'class-validator';
import { StartUsageSessionDto } from '../../usage/dtos/startUsageSession.dto';

/**
 * Payload for requesting a supervised usage session. Mirrors the regular start payload (notes,
 * project, form submissions) and adds the approval channel.
 *
 * Exactly one channel must be given: either a named supervisor who gets a popup on their own
 * device, or a reader that is armed to wait for any eligible supervisor's card (ATT-816).
 */
export class RequestSupervisedSessionDto extends StartUsageSessionDto {
  @ApiPropertyOptional({
    description: 'The ID of the user selected to supervise this session. Mutually exclusive with readerId.',
    example: 42,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  supervisorUserId?: number;

  @ApiPropertyOptional({
    description:
      'The ID of the Attractap reader to arm for supervisor card authentication. Any eligible ' +
      'supervisor may approve by tapping their card there. Mutually exclusive with supervisorUserId.',
    example: 3,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  readerId?: number;
}
