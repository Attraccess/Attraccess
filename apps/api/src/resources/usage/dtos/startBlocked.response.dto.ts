import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartBlockedReasonDto {
  @ApiProperty({ description: 'Machine-readable reason code chosen by the plugin', example: 'RESERVED' })
  code: string;

  @ApiProperty({ description: 'Short title, in the user language' })
  title: string;

  @ApiProperty({ description: 'Explanation, in the user language' })
  body: string;
}

export class StartBlockedResponseDto {
  @ApiProperty({ description: 'Whether a plugin reports that starting is blocked for the current user right now' })
  blocked: boolean;

  @ApiPropertyOptional({ description: 'Why the start is blocked; present when blocked', type: StartBlockedReasonDto })
  reason?: StartBlockedReasonDto;

  @ApiPropertyOptional({ description: 'When the block ends, if known', format: 'date-time' })
  until?: string;

  @ApiPropertyOptional({ description: 'Name of the plugin that reports the block' })
  plugin?: string;
}
