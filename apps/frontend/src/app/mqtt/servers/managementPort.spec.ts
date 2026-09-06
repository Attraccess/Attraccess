// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseManagementPort } from './managementPort';

describe('parseManagementPort', () => {
  it('sends an explicit null for an empty or cleared field', () => {
    expect(parseManagementPort('')).toBeNull();
  });

  it.each(['1', '65535', '18083'])('accepts port %s as a number', (value) => {
    expect(parseManagementPort(value)).toBe(Number(value));
  });

  it.each(['0', '-1', '65536', '1.5', '18083oops', 'NaN', 'Infinity', ' ', '1e1000'])(
    'rejects invalid port %s without truncating or clearing it',
    (value) => {
      expect(parseManagementPort(value)).toBeUndefined();
    },
  );
});
