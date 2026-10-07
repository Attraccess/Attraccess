import { BadRequestException } from '@nestjs/common';
import { Currency } from './dto/set-configuration.dto';
import { ConfigurationCurrencyTestScope } from './billing.service.spec';
export function registerConfigurationCurrencySetConfigurationThrowsOnInvalidCurrency(
  scope: ConfigurationCurrencyTestScope,
): void {
  it('setConfiguration throws on invalid currency', async () => {
    await expect(scope.service.setConfiguration({ currency: 'USD' as Currency })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
}
