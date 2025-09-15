import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export enum Currency {
  EUR = 'EUR',
}

export class SetBillingConfigurationDto {
  @IsString()
  @IsNotEmpty()
  @IsEnum(Currency)
  @ApiProperty({
    description: 'The currency to use',
    example: Currency.EUR,
    required: true,
    enum: Currency,
  })
  currency!: Currency;
}
