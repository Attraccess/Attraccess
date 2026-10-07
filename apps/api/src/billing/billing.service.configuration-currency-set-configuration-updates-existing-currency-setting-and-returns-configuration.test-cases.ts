import { Setting } from '@attraccess/database-entities';
import { Currency } from './dto/set-configuration.dto';
import { ConfigurationCurrencyTestScope } from './billing.service.spec';
export function registerConfigurationCurrencySetConfigurationUpdatesExistingCurrencySettingAndReturnsConfiguration(
  scope: ConfigurationCurrencyTestScope,
): void {
  it('setConfiguration updates existing currency setting and returns configuration', async () => {
    scope.settingRepository.findOneBy.mockResolvedValueOnce({
      id: 1,
      parent: 'billing',
      key: 'currency',
      value: 'EUR',
    } as Setting);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scope.settingRepository.update.mockResolvedValue({} as any);
    // getConfiguration call
    scope.settingRepository.findOneBy.mockResolvedValueOnce({
      id: 1,
      parent: 'billing',
      key: 'currency',
      value: 'EUR',
    } as Setting);

    const result = await scope.service.setConfiguration({ currency: Currency.EUR });
    expect(scope.settingRepository.update).toHaveBeenCalledWith(1, { value: Currency.EUR });
    expect(result).toEqual({ currency: Currency.EUR, minorUnit: 2 });
  });
}
