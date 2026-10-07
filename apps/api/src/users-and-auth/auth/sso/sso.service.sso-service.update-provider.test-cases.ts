import { registerSsoServiceFixture } from './sso.service.sso-service.test-fixture';
export function registerUpdateProviderCases(fixture: ReturnType<typeof registerSsoServiceFixture>) {
  describe('updateProvider', () => {
    it('should update an existing provider', async () => {
      const updateDto = { name: 'Updated Provider' };

      jest.spyOn(fixture.ssoProviderRepository, 'update').mockResolvedValueOnce(undefined);

      const result = await fixture.service.updateProvider(1, updateDto);

      expect(fixture.ssoProviderRepository.update).toHaveBeenCalledWith(1, { name: updateDto.name });
      expect(result).toEqual(fixture.mockSSOProviderWithOIDCConfig);
    });

    it('does not commit a provider update when its configuration write fails', async () => {
      fixture.oidcConfigRepository.update.mockRejectedValueOnce(new Error('configuration write failed'));

      await expect(
        fixture.service.updateProvider(1, { oidcConfiguration: { issuer: 'https://changed.example.com' } }),
      ).rejects.toThrow('configuration write failed');
      expect(fixture.ssoProviderRepository.manager.transaction).toHaveBeenCalled();
      expect(fixture.ssoProviderRepository.update).not.toHaveBeenCalled();
    });

    it('rolls back a provider update when the committed provider cannot be reloaded', async () => {
      jest
        .spyOn(fixture.ssoProviderRepository, 'findOne')
        .mockResolvedValueOnce(fixture.mockSSOProviderWithOIDCConfig)
        .mockResolvedValueOnce(null);

      await expect(fixture.service.updateProvider(1, { name: 'Changed Provider' })).rejects.toThrow(
        'Provider not found after update',
      );
      expect(fixture.ssoProviderRepository.manager.transaction).toHaveBeenCalled();
    });
  });
}
