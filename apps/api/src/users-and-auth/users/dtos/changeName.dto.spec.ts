import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangeNameDto } from './changeName.dto';

const check = async (payload: object) => {
  const dto = plainToInstance(ChangeNameDto, payload);
  return { dto, errors: await validate(dto) };
};

describe('ChangeNameDto', () => {
  it('trims the names', async () => {
    const { dto, errors } = await check({ firstName: '  Ada ', lastName: ' Lovelace ' });
    expect(errors).toEqual([]);
    expect(dto).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace' });
  });

  it('accepts null and blank to clear a name', async () => {
    expect((await check({ firstName: null, lastName: '   ' })).errors).toEqual([]);
  });

  it('accepts exactly 100 characters and refuses more', async () => {
    expect((await check({ firstName: 'x'.repeat(100), lastName: null })).errors).toEqual([]);
    const { errors } = await check({ firstName: 'x'.repeat(101), lastName: null });
    expect(errors.map((error) => error.property)).toEqual(['firstName']);
  });

  it('refuses a missing key instead of clearing that name', async () => {
    expect((await check({})).errors.map((error) => error.property)).toEqual(['firstName', 'lastName']);
    expect((await check({ firstName: 'Ada' })).errors.map((error) => error.property)).toEqual(['lastName']);
  });

  it('refuses non-string names', async () => {
    expect((await check({ firstName: 5, lastName: null })).errors).toHaveLength(1);
  });
});
