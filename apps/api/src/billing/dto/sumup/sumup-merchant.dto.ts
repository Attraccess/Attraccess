// DTO for SumUp Merchant API response with Swagger documentation
// FEATURE: Billing SumUp integration DTO layer

import { ApiProperty } from '@nestjs/swagger';

export class SumUpCompanyDto {
  @ApiProperty({ type: String, example: 'Attraccess GmbH', required: false })
  name?: string;
}

export class SumUpMerchantDto {
  @ApiProperty({ type: String, example: '1234567890' })
  merchant_code: string;

  @ApiProperty({ type: String, example: 'EUR' })
  default_currency: string;

  @ApiProperty({ type: String, example: 'en-US' })
  default_locale: string;

  @ApiProperty({ type: SumUpCompanyDto, required: false })
  company?: SumUpCompanyDto;
}
