import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber } from 'class-validator';
import { Currency } from './set-configuration.dto';

export class BillingConfigurationDto {
  @IsEnum(Currency)
  @IsNotEmpty()
  @ApiProperty({
    description: 'The currency to use',
    example: Currency.EUR,
    required: true,
    enum: Currency,
    enumName: 'Currency',
  })
  currency!: Currency;

  @IsNumber()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The minor unit of the currency',
    example: 2,
    required: true,
  })
  minorUnit!: number;
}
