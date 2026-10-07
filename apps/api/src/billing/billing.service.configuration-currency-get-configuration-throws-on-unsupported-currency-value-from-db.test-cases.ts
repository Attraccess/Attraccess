import { Setting } from '@attraccess/database-entities';
import { ConfigurationCurrencyTestScope } from './billing.service.spec';
export function registerConfigurationCurrencyGetConfigurationThrowsOnUnsupportedCurrencyValueFromDb(
  scope: ConfigurationCurrencyTestScope,
): void {
  it('getConfiguration throws on unsupported currency value from DB', async () => {
    scope.settingRepository.findOneBy.mockResolvedValue({ value: 'USD' } as Setting);
    await expect(scope.service.getConfiguration()).rejects.toBeInstanceOf(Error);
  });
}
