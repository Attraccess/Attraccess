import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMqttServerDto, UpdateMqttServerDto } from './mqtt-server.dto';

describe.each([
  { name: 'create', dto: CreateMqttServerDto, required: { name: 'Fixture', host: 'broker.invalid', port: 1883 } },
  { name: 'update', dto: UpdateMqttServerDto, required: {} },
])('$name managementPort validation', ({ dto, required }) => {
  it.each([1, 15672, 25671, 65535, null, undefined])('accepts %s without coercion', async (managementPort) => {
    const instance = plainToInstance(dto, { ...required, managementPort });

    expect(await validate(instance)).toEqual([]);
    expect(instance.managementPort).toBe(managementPort);
  });

  it('accepts omission without supplying a provider default', async () => {
    const instance = plainToInstance(dto, required);

    expect(await validate(instance)).toEqual([]);
    expect(instance.managementPort).toBeUndefined();
  });

  it.each([
    { value: 0, constraint: 'min' },
    { value: -1, constraint: 'min' },
    { value: 65536, constraint: 'max' },
    { value: 1.5, constraint: 'isInt' },
    { value: 65534.5, constraint: 'isInt' },
    { value: NaN, constraint: 'isInt' },
    { value: Infinity, constraint: 'isInt' },
    { value: -Infinity, constraint: 'isInt' },
    { value: '15672', constraint: 'isInt' },
    { value: '', constraint: 'isInt' },
    { value: 'null', constraint: 'isInt' },
    { value: true, constraint: 'isInt' },
    { value: false, constraint: 'isInt' },
    { value: [], constraint: 'isInt' },
    { value: [15672], constraint: 'isInt' },
    { value: {}, constraint: 'isInt' },
  ])('rejects $value with $constraint', async ({ value, constraint }) => {
    const instance = plainToInstance(dto, { ...required, managementPort: value });
    const errors = await validate(instance);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('managementPort');
    expect(errors[0].constraints).toHaveProperty(constraint);
  });
});
