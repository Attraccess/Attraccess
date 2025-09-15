import { ApiProperty } from '@nestjs/swagger';
import { SumUp } from '@sumup/sdk';

export class SumUpMerchantProfile implements SumUp.Merchant.MerchantProfile {
  @ApiProperty({ type: String, example: '1234567890' })
  merchant_code?: string;
  @ApiProperty({ type: String, example: 'Attraccess' })
  company_name?: string;
}

export class SumUpMerchantDto implements SumUp.Merchant.MerchantAccount {
  @ApiProperty({ type: SumUpMerchantProfile, required: false })
  merchant_profile?: SumUpMerchantProfile;
}
