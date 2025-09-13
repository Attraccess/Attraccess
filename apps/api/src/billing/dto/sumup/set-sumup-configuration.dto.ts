import { ApiProperty } from '@nestjs/swagger';
import { ToBoolean } from '../../../common/request-transformers';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export enum Currency {
  EUR = 'EUR',
}

export class SetSumUpConfigurationDto {
  @IsString()
  @IsNotEmpty()
  @IsEnum(Currency)
  @ApiProperty({
    description: 'The currency for the SumUp configuration',
    example: Currency.EUR,
    required: true,
    enum: Currency,
  })
  currency!: Currency;

  @IsNumber()
  @IsPositive()
  @ApiProperty({
    description:
      'The currency to credits rate for the SumUp configuration, e.g. 100 means 100 credits for 1 (currency) unit',
    example: 100,
    required: true,
  })
  currencyToCreditsRate!: number;

  @ToBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether to adjust existing balances',
    example: true,
    required: false,
    type: Boolean,
  })
  adjustExistingBalances?: boolean;
}
