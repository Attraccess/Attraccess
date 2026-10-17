import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateDateTimePreferencesDto } from './updateDateTimePreferences.dto';

describe('UpdateDateTimePreferencesDto', () => {
  it.each([undefined, '', '  ', 'en_US', 'zz-ZZ', 123, {}, 'x'.repeat(256)])(
    'rejects missing, malformed, unsupported or excessive input: %j',
    async (dateTimeLocale) => {
      expect(
        await validate(
          plainToInstance(UpdateDateTimePreferencesDto, { dateTimeLocale }, { enableImplicitConversion: true }),
        ),
      ).not.toHaveLength(0);
    },
  );
  it.each([null, 'en-GB', ' en-us ', 'de-DE', 'ja-JP'])(
    'accepts reset and supported locales: %j',
    async (dateTimeLocale) => {
      expect(
        await validate(
          plainToInstance(UpdateDateTimePreferencesDto, { dateTimeLocale }, { enableImplicitConversion: true }),
        ),
      ).toHaveLength(0);
    },
  );
});
