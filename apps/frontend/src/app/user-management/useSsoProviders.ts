import {
  SSOProvider,
  useAuthenticationServiceGetAllSsoProviders,
  useLicenseServiceGetLicenseInformation,
} from '@attraccess/react-query-client';

/** SSO providers, only fetched when the license includes the sso module. */
export function useSsoProviders(): SSOProvider[] | undefined {
  const { data: license } = useLicenseServiceGetLicenseInformation();
  const { data: ssoProviders } = useAuthenticationServiceGetAllSsoProviders(undefined, {
    enabled: license?.modules.includes('sso'),
  });
  return ssoProviders;
}
