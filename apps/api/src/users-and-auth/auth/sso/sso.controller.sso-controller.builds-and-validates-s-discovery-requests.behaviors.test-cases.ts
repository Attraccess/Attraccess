import * as discovery from './sso-discovery-request';
import { registerSsoControllerFixture } from './sso.controller.sso-controller.test-fixture';
import { SSOProviderType } from '@attraccess/database-entities';
import { CreateSSOProviderDto } from './dto/create-sso-provider.dto';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { NotFoundException } from '@nestjs/common';

export function registerBuildsAndValidatesSDiscoveryRequestsCases(
  fixture: ReturnType<typeof registerSsoControllerFixture>,
) {
  it.each(['discoverAuthentik', 'discoverKeycloak'] as const)(
    'builds and validates %s discovery requests',
    async (method) => {
      const fetchMock = jest
        .spyOn(discovery, 'requestDiscoveryJson')
        .mockResolvedValue({ issuer: 'https://idp.example' });
      try {
        expect(await fixture.controller[method]('idp.example/', 'team name')).toEqual({
          issuer: 'https://idp.example',
        });
        const route = method === 'discoverAuthentik' ? 'application/o' : 'realms';
        expect(fetchMock).toHaveBeenCalledWith(
          new URL(`http://idp.example/${route}/team%20name/.well-known/openid-configuration`),
        );
        await fixture.controller[method]('https://idp.example', 'team');
        expect(fetchMock).toHaveBeenLastCalledWith(
          new URL(`https://idp.example/${route}/team/.well-known/openid-configuration`),
        );
        fetchMock.mockRejectedValue(new Error('503 Unavailable'));
        await expect(fixture.controller[method]('https://idp.example', 'team')).rejects.toThrow('503 Unavailable');
        await expect(fixture.controller[method]('', 'team')).rejects.toThrow('Missing required');
        await expect(fixture.controller[method]('idp.example', '')).rejects.toThrow('Missing required');
      } finally {
        fetchMock.mockRestore();
      }
    },
  );
}

export function registerCreateProviderCases(fixture: ReturnType<typeof registerSsoControllerFixture>) {
  describe('createProvider', () => {
    it('should create a new provider when user has permission', async () => {
      const createDto: CreateSSOProviderDto = {
        name: 'New Provider',
        type: SSOProviderType.OIDC,
        oidcConfiguration: {
          issuer: 'https://new-issuer.com',
          authorizationURL: 'https://new-issuer.com/auth',
          tokenURL: 'https://new-issuer.com/token',
          userInfoURL: 'https://new-issuer.com/userinfo',
          clientId: 'new-client-id',
          clientSecret: 'new-client-secret',
        },
      };

      const result = await fixture.controller.createOne(createDto, { user: { id: 1 } } as AuthenticatedRequest);

      expect(result).toEqual(fixture.mockSSOProvider);
      expect(fixture.ssoService.createProvider).toHaveBeenCalledWith(createDto);
      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sso.provider.created',
          actorId: 1,
          details: { before: 'null', after: expect.not.stringContaining('test-client-secret') },
        }),
      );
    });

    it('keeps provider creation successful when the awaited audit receipt fails', async () => {
      fixture.ssoAudit.record.mockRejectedValueOnce(new Error('audit unavailable'));

      await expect(
        fixture.controller.createOne(
          { name: 'New Provider', type: SSOProviderType.OIDC } as CreateSSOProviderDto,
          {
            user: { id: 1 },
          } as AuthenticatedRequest,
        ),
      ).resolves.toEqual(fixture.mockSSOProvider);
    });
  });
}

export function registerDeleteProviderCases(fixture: ReturnType<typeof registerSsoControllerFixture>) {
  describe('deleteProvider', () => {
    it('should delete a provider when user has permission', async () => {
      await fixture.controller.deleteOne('1', { user: { id: 1 } } as AuthenticatedRequest);

      expect(fixture.ssoService.deleteProvider).toHaveBeenCalledWith(1);
      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sso.provider.deleted',
          actorId: 1,
          details: expect.objectContaining({ after: 'null' }),
        }),
      );
    });
  });
}

export function registerGetProviderByIdCases(fixture: ReturnType<typeof registerSsoControllerFixture>) {
  describe('getProviderById', () => {
    it('should return a single provider', async () => {
      const result = await fixture.controller.getOneById('1');
      expect(result).toEqual(fixture.mockSSOProvider);
      expect(fixture.ssoService.getProviderById).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if provider not found', async () => {
      jest.spyOn(fixture.ssoService, 'getProviderById').mockRejectedValueOnce(new NotFoundException());
      await expect(fixture.controller.getOneById('999')).rejects.toThrow(NotFoundException);
    });
  });
}

export function registerGetProvidersCases(fixture: ReturnType<typeof registerSsoControllerFixture>) {
  describe('getProviders', () => {
    it('should return an array of providers', async () => {
      const result = await fixture.controller.getAll();
      expect(result).toEqual([fixture.mockSSOProvider]);
      expect(fixture.ssoService.getAllProviders).toHaveBeenCalled();
    });
  });
}

export function registerShouldBeDefinedCases(fixture: ReturnType<typeof registerSsoControllerFixture>) {
  it('should be defined', () => {
    expect(fixture.controller).toBeDefined();
  });
}
