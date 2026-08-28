import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export const bleProxyOperations = ['scan', 'connect', 'read', 'write', 'disconnect'] as const;
export type BleProxyOperation = (typeof bleProxyOperations)[number];

export class BleProxyCommandDto {
  @ApiProperty({ enum: bleProxyOperations })
  @IsIn(bleProxyOperations)
  operation: BleProxyOperation;

  @ApiPropertyOptional({ example: 'aa:bb:cc:dd:ee:ff' })
  @IsOptional()
  @IsString()
  @Matches(/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/)
  address?: string;

  @ApiPropertyOptional({ description: 'NimBLE address type returned by scan', example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  addressType?: number;

  @ApiPropertyOptional({ example: '4d4f4445-5343-4f2d-574f-514b45523232' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-fA-F-]{36}$/)
  serviceUuid?: string;

  @ApiPropertyOptional({ example: '4d4f4445-5343-4f2d-574f-524a45523043' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-fA-F-]{36}$/)
  characteristicUuid?: string;

  @ApiPropertyOptional({ description: 'Raw characteristic value encoded as hexadecimal', example: '31323334303031' })
  @IsOptional()
  @IsString()
  @Matches(/^(?:[0-9a-fA-F]{2})*$/)
  @MaxLength(1024)
  valueHex?: string;
}

export interface BleProxyResult {
  requestId: string;
  operation: BleProxyOperation;
  success: boolean;
  error?: string;
  address?: string;
  addressType?: number;
  rssi?: number;
  name?: string;
  valueHex?: string;
}
