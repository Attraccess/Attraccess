import { Setting } from '@attraccess/database-entities';
import { Currency } from './dto/set-configuration.dto';
import { ConfigurationCurrencyTestScope } from './billing.service.spec';
export function registerConfigurationCurrencySetConfigurationInsertsCurrencyWhenNotExistingAndReturnsConfiguration(
  scope: ConfigurationCurrencyTestScope,
): void {
  it('setConfiguration inserts currency when not existing and returns configuration', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scope.settingRepository.findOneBy.mockResolvedValueOnce(null as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scope.settingRepository.insert.mockResolvedValue({} as any);
    // getConfiguration call
    scope.settingRepository.findOneBy.mockResolvedValueOnce({
      id: 2,
      parent: 'billing',
      key: 'currency',
      value: 'EUR',
    } as Setting);

    const result = await scope.service.setConfiguration({ currency: Currency.EUR });
    expect(scope.settingRepository.insert).toHaveBeenCalledWith({
      parent: 'billing',
      key: 'currency',
      value: Currency.EUR,
    });
    expect(result).toEqual({ currency: Currency.EUR, minorUnit: 2 });
  });
}
