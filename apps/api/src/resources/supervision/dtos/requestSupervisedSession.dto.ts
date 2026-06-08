import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';
import { StartUsageSessionDto } from '../../usage/dtos/startUsageSession.dto';

/**
 * Payload for requesting a supervised usage session. Mirrors the regular start payload (notes,
 * project, form submissions) and adds the selected supervisor.
 */
export class RequestSupervisedSessionDto extends StartUsageSessionDto {
  @ApiProperty({
    description: 'The ID of the user selected to supervise this session',
    example: 42,
  })
  @IsInt()
  @IsPositive()
  supervisorUserId!: number;
}
