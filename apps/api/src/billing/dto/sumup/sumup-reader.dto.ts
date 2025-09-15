import { ApiProperty } from '@nestjs/swagger';
import { SumUp } from '@sumup/sdk';

export class SumUpReaderDevice implements SumUp.Readers.ReaderDevice {
  @ApiProperty({ type: String, example: '1234567890' })
  identifier: string;

  @ApiProperty({
    type: String,
    example: 'solo',
    enum: ['solo', 'virtual-solo'] as SumUp.Readers.ReaderDevice['model'][],
  })
  model: 'solo' | 'virtual-solo';
}

export class SumUpReaderDto implements SumUp.Readers.Reader {
  @ApiProperty({ type: String, example: '1234567890' })
  id: string;

  @ApiProperty({ type: String, example: 'Reader 1' })
  name: string;

  @ApiProperty({
    type: 'string',
    example: 'active',
    enum: ['unknown', 'processing', 'paired', 'expired'] as SumUp.Readers.ReaderStatus[],
  })
  status: SumUp.Readers.ReaderStatus;

  @ApiProperty({ type: SumUpReaderDevice })
  device: SumUpReaderDevice;

  @ApiProperty({ type: Object, example: {}, required: false, additionalProperties: true })
  meta?: SumUp.Readers.Meta;

  @ApiProperty({ type: String, example: '2021-01-01T00:00:00.000Z', format: 'date-time' })
  created_at: string;

  @ApiProperty({ type: String, example: '2021-01-01T00:00:00.000Z', format: 'date-time' })
  updated_at: string;
}
