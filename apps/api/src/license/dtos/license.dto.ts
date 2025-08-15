import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LicenseDataDto {
  @ApiProperty({ description: 'Whether the license is valid' })
  valid!: boolean;

  @ApiPropertyOptional({ description: 'Reason for invalidity when not valid' })
  reason?: string;

  @ApiProperty({
    description: 'The raw payload as returned by the license server',
    type: 'string',
    isArray: true,
    example: ['attractap', 'sso'],
  })
  modules!: string[];

  @ApiProperty({
    description: 'The raw payload as returned by the license server',
    type: 'object',
    additionalProperties: true,
  })
  usageLimits!: Record<string, number>;

  @ApiProperty({
    description: 'Are you using this software for free as a non-profit?',
    type: 'boolean',
  })
  isNonProfit!: boolean;
}
