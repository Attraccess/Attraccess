import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsNumber } from 'class-validator';
import { Currency } from './set-sumup-configuration.dto';

export class SumUpConfigurationDto {
  @IsBoolean()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Whether the SumUp configuration is enabled',
    example: true,
    required: true,
  })
  enabled!: boolean;

  @IsEnum(Currency)
  @IsNotEmpty()
  @ApiProperty({
    description: 'The currency for the SumUp configuration',
    example: Currency.EUR,
    required: true,
    enum: Currency,
  })
  currency!: Currency;

  @IsNumber()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The currency to credits rate for the SumUp configuration',
    example: 100,
  })
  currencyToCreditsRate!: number;
}
