export type ModbusValidationError = { path: string; code: string; message: string };
export function createModbusValidation(errors: ModbusValidationError[]) {
  const fail = (path: string, message: string) => errors.push({ path, code: 'invalid_modbus', message });
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const integer = (v: unknown, min: number, max: number) =>
    Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
  const name = (v: unknown) => typeof v === 'string' && !!v.trim() && v.length <= 160;
  const keys = (v: object, allowed: string[], path: string) => {
    for (const key of Object.keys(v)) if (!allowed.includes(key)) fail(`${path}.${key}`, 'unknown field');
  };

  return { fail, object, integer, name, keys };
}
export type ModbusValidation = ReturnType<typeof createModbusValidation>;
