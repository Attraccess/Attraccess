import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional } from 'class-validator';

export class UpdateGatewayCalibrationDto {
  @ApiProperty({
    description: 'Calibrated RSSI at 1 meter (dBm)',
    example: -55,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  txPowerAt1m!: number;

  @ApiProperty({
    description: 'Path-loss exponent for the environment',
    example: 2.1,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  pathLossExponent!: number;

  @ApiProperty({
    description: 'When calibration was last updated (defaults to now)',
    required: false,
    format: 'date-time',
    example: '2026-01-28T12:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  calibrationUpdatedAt?: string;
}
