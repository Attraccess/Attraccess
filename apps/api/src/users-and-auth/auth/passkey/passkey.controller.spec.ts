import { PasskeyController } from './passkey.controller';
import { Request, Response } from 'express';
import { expectNoPrivateAccountFields, privateAccount } from '../private-account.test-fixture';

describe('passkey ceremony origin', () => {
  it.each([
    [{ origin: 'https://app.example', referer: 'https://other.example/path' }, 'https://app.example'],
    [{ origin: 'null', referer: 'https://app.example:8443/settings/passkeys' }, 'https://app.example:8443'],
    [{ referer: 'https://app.example/account' }, 'https://app.example'],
    [{ referer: 'not a URL' }, undefined],
    [{}, undefined],
  ])('passes the browser origin or valid referer fallback to the WebAuthn service', async (headers, expected) => {
    const service = {
      createAuthenticationOptions: jest.fn().mockResolvedValue({ challenge: 'challenge' }),
      assertIpAllowed: jest.fn(),
    };
    const controller = new PasskeyController(service as never, {} as never, {} as never);
    const result = await controller.authenticationOptions({ headers, ip: '127.0.0.1' } as Request);
    expect(result).toEqual({ options: { challenge: 'challenge' } });
    expect(service.createAuthenticationOptions).toHaveBeenCalledWith(expected);
    expect(service.assertIpAllowed).toHaveBeenCalledWith('127.0.0.1');
  });
});

describe('passkey sign-in response', () => {
  it.each(['body', 'cookie'] as const)(
    'returns only the public profile of the signed-in account (token in %s)',
    async (tokenLocation) => {
      const service = { assertIpAllowed: jest.fn(), signIn: jest.fn().mockResolvedValue(privateAccount()) };
      const sessions = { createSession: jest.fn().mockResolvedValue('session-token') };
      const cookies = { setAuthCookie: jest.fn() };
      const controller = new PasskeyController(service as never, sessions as never, cookies as never);

      const result = await controller.createSession(
        { headers: {}, ip: '127.0.0.1' } as Request,
        {} as Response,
        { response: {}, tokenLocation } as never,
      );

      expectNoPrivateAccountFields(result);
    },
  );
});
