import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateReaderDto } from './update-reader.dto';

const base = { name: 'Reader', connectedResourceIds: [1] };

async function errorsFor(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateReaderDto, body, { enableImplicitConversion: true });
  return validate(dto);
}

describe('UpdateReaderDto allowPluginBle', () => {
  it.each([true, false])('accepts the boolean %j and keeps it unchanged', async (allowPluginBle) => {
    const body = { ...base, allowPluginBle };
    expect(await errorsFor(body)).toHaveLength(0);
    expect(plainToInstance(UpdateReaderDto, body, { enableImplicitConversion: true }).allowPluginBle).toBe(
      allowPluginBle,
    );
  });

  it('treats an omitted field as "keep the current setting"', async () => {
    expect(await errorsFor(base)).toHaveLength(0);
  });

  it.each(['yes', 'false', 'true', 0, 1, null, {}, []])(
    'rejects the non-boolean value %j instead of coercing it',
    async (allowPluginBle) => {
      const errors = await errorsFor({ ...base, allowPluginBle });
      expect(errors.map((error) => error.property)).toContain('allowPluginBle');
    },
  );
});
