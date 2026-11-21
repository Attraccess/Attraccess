import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FormResourceOverrideDto } from './form-admin.dto';
import { CreateFormDto } from './create-form.dto';
import { UpdateFormDto } from './update-form.dto';

// The API's global ValidationPipe converts implicitly; the override must still reject non-booleans.
const parse = (body: Record<string, unknown>) =>
  plainToInstance(FormResourceOverrideDto, body, { enableImplicitConversion: true });

async function invalidProperties(body: Record<string, unknown>) {
  return (await validate(parse(body))).map((error) => error.property);
}

describe('FormResourceOverrideDto', () => {
  it('accepts booleans, null flags and omitted flags unchanged', async () => {
    const body = { disabled: false, isRequiredOnResourceUsageStart: true, isRequiredOnResourceUsageEnd: null };
    expect(await invalidProperties(body)).toEqual([]);
    expect(parse(body)).toMatchObject(body);
  });

  it.each(['yes', 'false', 1, 0])('rejects disabled=%j instead of coercing it', async (disabled) => {
    expect(await invalidProperties({ disabled })).toContain('disabled');
  });

  it.each(['true', 'false', 1])('rejects the flag value %j instead of coercing it', async (value) => {
    expect(await invalidProperties({ disabled: false, isRequiredOnResourceUsageTakeOver: value })).toContain(
      'isRequiredOnResourceUsageTakeOver',
    );
  });
});

describe.each([
  ['CreateFormDto', CreateFormDto],
  ['UpdateFormDto', UpdateFormDto],
] as const)('%s', (_, dto) => {
  const valid = {
    name: 'Safety',
    scope: 'global',
    isRequiredOnResourceUsageStart: false,
    isRequiredOnResourceUsageTakeOver: true,
    isRequiredOnResourceUsageEnd: false,
    fields: [{ name: 'Goggles?', position: 0, type: 'boolean', isRequired: true }],
  };
  const invalid = async (body: Record<string, unknown>) =>
    (await validate(plainToInstance(dto, body, { enableImplicitConversion: true }))).map((error) => error.property);

  it('accepts boolean defaults unchanged', async () => {
    expect(await invalid(valid)).toEqual([]);
    expect(plainToInstance(dto, valid, { enableImplicitConversion: true })).toMatchObject(valid);
  });

  it.each(['false', 'true', 0, 1])('rejects the default flag %j instead of coercing it', async (value) => {
    expect(await invalid({ ...valid, isRequiredOnResourceUsageEnd: value })).toContain('isRequiredOnResourceUsageEnd');
  });

  it('rejects a field whose isRequired is not a boolean', async () => {
    expect(await invalid({ ...valid, fields: [{ ...valid.fields[0], isRequired: 'false' }] })).toContain('fields');
  });
});
