import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsObject, IsString } from 'class-validator';

export enum SumupTransactionEventType {
  SoloTransactionUpdated = 'solo.transaction.updated',
}

export enum SumupTransactionStatus {
  Successful = 'successful',
  Failed = 'failed',
}

class Payload {
  @ApiProperty({
    description: 'The ID of the transaction',
    example: '1234567890',
  })
  @IsString()
  client_transaction_id: string;

  @ApiProperty({
    description: 'The merchant code',
    example: 'MPMGEBZF',
  })
  @IsString()
  merchant_code: string;

  @ApiProperty({
    description: 'The status of the transaction',
    example: SumupTransactionStatus.Successful,
    enum: SumupTransactionStatus,
    type: String,
  })
  @IsEnum(SumupTransactionStatus)
  status: SumupTransactionStatus;

  @ApiProperty({
    description: 'The ID of the transaction',
    example: '8f0973dc-60df-4a8c-80ee-a06103c1d10e',
  })
  @IsString()
  transaction_id: string;
}

export class SumupTransactionCallbackDto {
  @ApiProperty({
    description: 'The ID of the transaction',
    example: '1234567890',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'The type of the transaction',
    example: SumupTransactionEventType.SoloTransactionUpdated,
    enum: SumupTransactionEventType,
    type: String,
  })
  @IsEnum(SumupTransactionEventType)
  event_type: SumupTransactionEventType;

  @ApiProperty({
    description: 'The payload of the transaction',
    example: {
      client_transaction_id: '1234567890',
      merchant_code: 'MPMGEBZF',
      status: SumupTransactionStatus.Successful,
      transaction_id: '8f0973dc-60df-4a8c-80ee-a06103c1d10e',
    },
    type: Payload,
  })
  @IsObject()
  payload: Payload;

  @ApiProperty({
    description: 'The timestamp of the transaction',
    example: '2025-09-13T21:31:56.984208Z',
    type: String,
    format: 'date-time',
  })
  @IsString()
  timestamp: string;
}
