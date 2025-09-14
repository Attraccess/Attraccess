import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

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
}
