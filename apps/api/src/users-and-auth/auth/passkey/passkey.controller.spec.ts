import { PasskeyController } from './passkey.controller';
import { Request } from 'express';

describe('passkey ceremony origin', () => {
  it.each([
    [{ origin: 'https://app.example', referer: 'https://other.example/path' }, 'https://app.example'],
    [{ origin: 'null', referer: 'https://app.example:8443/settings/passkeys' }, 'https://app.example:8443'],
    [{ referer: 'https://app.example/account' }, 'https://app.example'],
    [{ referer: 'not a URL' }, undefined],
    [{}, undefined],
  ])('passes the browser origin or valid referer fallback to the WebAuthn service', async (headers, expected) => {
    const service = { createAuthenticationOptions: jest.fn().mockResolvedValue({ challenge: 'challenge' }) };
    const bruteForce = { assertIpAllowed: jest.fn() };
    const controller = new PasskeyController(
      service as never,
      {} as never,
      {} as never,
      bruteForce as never,
      {} as never,
    );
    const result = await controller.authenticationOptions({ headers, ip: '127.0.0.1' } as Request);
    expect(result).toEqual({ options: { challenge: 'challenge' } });
    expect(service.createAuthenticationOptions).toHaveBeenCalledWith(expected);
    expect(bruteForce.assertIpAllowed).toHaveBeenCalledWith('login', '127.0.0.1');
  });
});
