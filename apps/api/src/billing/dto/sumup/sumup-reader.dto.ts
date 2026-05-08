// DTO for SumUp Reader API response with Swagger documentation
// FEATURE: Billing SumUp integration DTO layer

import { ApiProperty } from '@nestjs/swagger';
import type { Reader, ReaderDevice, ReaderStatus, Metadata } from '@sumup/sdk';

export class SumUpReaderDevice implements ReaderDevice {
  @ApiProperty({ type: String, example: '1234567890' })
  identifier: string;

  @ApiProperty({
    type: String,
    example: 'solo',
    enum: ['solo', 'virtual-solo'] as ReaderDevice['model'][],
    enumName: 'SumUpReaderModel',
  })
  model: 'solo' | 'virtual-solo';
}

export class SumUpReaderDto implements Reader {
  @ApiProperty({ type: String, example: '1234567890' })
  id: string;

  @ApiProperty({ type: String, example: 'Reader 1' })
  name: string;

  @ApiProperty({
    type: 'string',
    example: 'active',
    enum: ['unknown', 'processing', 'paired', 'expired'] as ReaderStatus[],
    enumName: 'SumUpReaderStatus',
  })
  status: ReaderStatus;

  @ApiProperty({ type: SumUpReaderDevice })
  device: SumUpReaderDevice;

  @ApiProperty({ type: Object, example: {}, required: false, additionalProperties: true })
  metadata?: Metadata;

  @ApiProperty({ type: String, example: '2021-01-01T00:00:00.000Z', format: 'date-time' })
  created_at: string;

  @ApiProperty({ type: String, example: '2021-01-01T00:00:00.000Z', format: 'date-time' })
  updated_at: string;
}
