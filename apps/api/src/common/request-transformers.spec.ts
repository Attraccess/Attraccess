import 'reflect-metadata';
import { plainToClass } from 'class-transformer';
import { ToBoolean, ToJson } from './request-transformers';

describe('ToBoolean transformer', () => {
  // Create a test class with the transformer
  class TestClass {
    @ToBoolean()
    property: boolean;
  }

  // Helper function to transform the value
  const transform = (value: unknown): unknown => {
    const plain = { property: value };
    const instance = plainToClass(TestClass, plain);
    return instance.property;
  };

  it('should leave boolean values unchanged', () => {
    expect(transform(true)).toBe(true);
    expect(transform(false)).toBe(false);
  });

  it('should transform string "true" to boolean true', () => {
    expect(transform('true')).toBe(true);
    expect(transform('TRUE')).toBe(true);
    expect(transform('True')).toBe(true);
  });

  it('should transform string "false" to boolean false', () => {
    expect(transform('false')).toBe(false);
    expect(transform('FALSE')).toBe(false);
    expect(transform('False')).toBe(false);
  });

  it('should transform "1" to true and "0" to false', () => {
    expect(transform('1')).toBe(true);
    expect(transform('0')).toBe(false);
  });

  it('should transform "yes"/"no" to boolean values', () => {
    expect(transform('yes')).toBe(true);
    expect(transform('YES')).toBe(true);
    expect(transform('no')).toBe(false);
    expect(transform('NO')).toBe(false);
  });

  it('should transform "on"/"off" to boolean values', () => {
    expect(transform('on')).toBe(true);
    expect(transform('ON')).toBe(true);
    expect(transform('off')).toBe(false);
    expect(transform('OFF')).toBe(false);
  });

  it('should return undefined for unknown string values', () => {
    expect(transform('something')).toBe(undefined);
    expect(transform('random')).toBe(undefined);
  });

  it('should leave null and undefined unchanged', () => {
    expect(transform(null)).toBe(null);
    expect(transform(undefined)).toBe(undefined);
  });
});

describe('ToJson transformer', () => {
  class TestClass {
    @ToJson()
    property: unknown;
  }

  const transform = (value: unknown): unknown => {
    const plain = { property: value };
    const instance = plainToClass(TestClass, plain);
    return instance.property;
  };

  it('should leave non-string values unchanged', () => {
    const value = { key: 'value' };
    expect(transform(value)).toEqual(value);
    expect(transform(42)).toBe(42);
  });

  it('should parse JSON objects from strings', () => {
    expect(transform('{"key":"value"}')).toEqual({ key: 'value' });
  });

  it('should parse JSON arrays from strings', () => {
    expect(transform('["one","two"]')).toEqual(['one', 'two']);
  });

  it('should return the original string on parse errors', () => {
    expect(transform('{invalid')).toEqual('{invalid');
  });

  it('should leave null and undefined unchanged', () => {
    expect(transform(null)).toBe(null);
    expect(transform(undefined)).toBe(undefined);
  });
});
