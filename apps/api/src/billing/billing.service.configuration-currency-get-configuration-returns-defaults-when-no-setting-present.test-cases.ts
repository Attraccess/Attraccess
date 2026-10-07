import { Currency } from './dto/set-configuration.dto';
import { ConfigurationCurrencyTestScope } from './billing.service.spec';
export function registerConfigurationCurrencyGetConfigurationReturnsDefaultsWhenNoSettingPresent(
  scope: ConfigurationCurrencyTestScope,
): void {
  it('getConfiguration returns defaults when no setting present', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scope.settingRepository.findOneBy.mockResolvedValue(null as any);
    const result = await scope.service.getConfiguration();
    expect(result).toEqual({ currency: Currency.EUR, minorUnit: 2 });
  });
}
