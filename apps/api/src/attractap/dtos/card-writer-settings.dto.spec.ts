import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CardWriterSettingsDto } from './card-writer-settings.dto';

const base = { mode: 'all', readerIds: [] };

async function errorsFor(body: Record<string, unknown>) {
  return validate(plainToInstance(CardWriterSettingsDto, body, { enableImplicitConversion: true }));
}

describe('CardWriterSettingsDto allowUidOnlyCards', () => {
  it.each([true, false])('accepts the boolean %j unchanged', async (allowUidOnlyCards) => {
    const body = { ...base, allowUidOnlyCards };
    expect(await errorsFor(body)).toHaveLength(0);
    expect(
      plainToInstance(CardWriterSettingsDto, body, { enableImplicitConversion: true }).allowUidOnlyCards,
    ).toBe(allowUidOnlyCards);
  });

  it('treats an omitted field as "keep the stored value"', async () => {
    expect(await errorsFor(base)).toHaveLength(0);
  });

  it.each(['yes', 'false', 'true', 0, 1, {}, []])(
    'rejects the non-boolean value %j instead of coercing it into a dangerous switch',
    async (allowUidOnlyCards) => {
      const errors = await errorsFor({ ...base, allowUidOnlyCards });
      expect(errors.map((error) => error.property)).toContain('allowUidOnlyCards');
    },
  );
});
