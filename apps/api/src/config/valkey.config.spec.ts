import { loadEnv } from '@attraccess/env';
import valkeyConfig, { INSTANCE_NAME_PIPE_MESSAGE, valkeyEnvSchema } from './valkey.config';

describe('valkey config: ATTRACCESS_INSTANCE_NAME', () => {
  it('trims the value and treats blank as unset', () => {
    expect(loadEnv(valkeyEnvSchema, { ATTRACCESS_INSTANCE_NAME: ' replica-1 ' }).ATTRACCESS_INSTANCE_NAME).toBe(
      'replica-1',
    );
    expect(loadEnv(valkeyEnvSchema, { ATTRACCESS_INSTANCE_NAME: '  ' }).ATTRACCESS_INSTANCE_NAME).toBeUndefined();
    expect(loadEnv(valkeyEnvSchema, {}).ATTRACCESS_INSTANCE_NAME).toBeUndefined();
  });

  it('refuses to start with a name that contains "|"', () => {
    const original = process.env.ATTRACCESS_INSTANCE_NAME;
    process.env.ATTRACCESS_INSTANCE_NAME = 'a|b';
    try {
      expect(() => valkeyConfig()).toThrow(INSTANCE_NAME_PIPE_MESSAGE);
    } finally {
      if (original === undefined) delete process.env.ATTRACCESS_INSTANCE_NAME;
      else process.env.ATTRACCESS_INSTANCE_NAME = original;
    }
  });
});
