import { BadRequestException } from '@nestjs/common';
import * as discovery from './providers/discovery-client';
import { SsoProviderRoutes } from './providers/provider-routes';

describe('SSO discovery parameters', () => {
  const routes: Pick<SsoProviderRoutes, 'discoverAuthentik' | 'discoverKeycloak'> = Object.create(
    SsoProviderRoutes.prototype,
  );
  const fetchMock = jest.spyOn(discovery, 'requestDiscoveryJson');

  afterEach(() => fetchMock.mockReset());
  afterAll(() => fetchMock.mockRestore());

  it.each([null, [], ['localhost'], { host: 'localhost' }])('rejects a non-string host: %p', async (host) => {
    await expect(routes.discoverAuthentik(host as never, 'application')).rejects.toBeInstanceOf(BadRequestException);
    await expect(routes.discoverKeycloak(host as never, 'realm')).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects repeated application or realm parameters before requesting discovery', async () => {
    await expect(routes.discoverAuthentik('localhost', ['one', 'two'] as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(routes.discoverKeycloak('localhost', ['one', 'two'] as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retains discovery for the documented local identity providers', async () => {
    fetchMock.mockResolvedValue({ issuer: 'fixture' });
    await routes.discoverAuthentik('http://localhost:9000/', 'application');
    await routes.discoverKeycloak('http://localhost:8080/', 'realm');
    expect(fetchMock.mock.calls.map(([url]) => url.toString())).toEqual([
      'http://localhost:9000/application/o/application/.well-known/openid-configuration',
      'http://localhost:8080/realms/realm/.well-known/openid-configuration',
    ]);
  });
});
