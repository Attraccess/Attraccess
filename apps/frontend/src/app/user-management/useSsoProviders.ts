import { SsoProvider, useGetAllSsoProviders, useGetLicenseInformation } from '@attraccess/react-query-client';

/** SSO providers, only fetched when the license includes the sso module. */
export function useSsoProviders(): SsoProvider[] | undefined {
  const { data: license } = useGetLicenseInformation();
  const { data: ssoProviders } = useGetAllSsoProviders({}, undefined, {
    enabled: license?.modules.includes('sso'),
  });
  return ssoProviders;
}
