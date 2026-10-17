import React from 'react';
import { SSOProviderType, useSsoServiceGetSsoLogoutUrls } from '@attraccess/react-query-client';
import { getBaseUrl } from '../../../api';
import { escapeRegex } from './formDefaults';

export interface SSOProviderSetupUrls {
  ssoBaseUrl: string | undefined;
  docsSsoProvidersUrl: string | undefined;
  docsAuthentikPermissionsUrl: string | undefined;
  samlCallbackUrl: string;
  oidcCallbackUrl: string;
  authentikRedirectRegexPattern: string;
  hasSetupUrls: boolean;
  postLogoutUrl: string;
  backchannelLogoutUrl: string;
  frontchannelLogoutUrl: string;
  samlSloUrl: string;
}

const buildCallbackUrl = (ssoBaseUrl: string | undefined, type: SSOProviderType, providerId?: number) => {
  if (!providerId) {
    return '';
  }

  try {
    if (!ssoBaseUrl) {
      return '';
    }
    const callbackUrl = new URL(ssoBaseUrl);
    callbackUrl.pathname = `/api/auth/sso/${type}/${providerId}/callback${type === SSOProviderType.SAML ? '*' : ''}`;
    callbackUrl.search = '';
    callbackUrl.hash = '';
    return callbackUrl.toString();
  } catch {
    return '';
  }
};

export const useSSOProviderSetupUrls = (providerId?: number): SSOProviderSetupUrls => {
  const { data: logoutUrls } = useSsoServiceGetSsoLogoutUrls({ providerId: providerId ?? 0 }, undefined, {
    enabled: !!providerId,
    retry: false,
  });
  const ssoBaseUrl = React.useMemo(() => {
    // The API's public origin can differ from the browser's frontend origin.
    if (logoutUrls?.postLogoutUrl) {
      return new URL(logoutUrls.postLogoutUrl).origin;
    }
    if (typeof window === 'undefined') {
      return undefined;
    }

    return getBaseUrl() ?? window.location.origin;
  }, [logoutUrls?.postLogoutUrl]);

  const docsSsoProvidersUrl = React.useMemo(() => {
    if (!ssoBaseUrl) {
      return undefined;
    }
    return new URL('/docs/user/sso-providers', ssoBaseUrl).toString();
  }, [ssoBaseUrl]);

  const docsAuthentikPermissionsUrl = React.useMemo(() => {
    if (!ssoBaseUrl) {
      return undefined;
    }
    return new URL('/docs/user/sso-authentik-permissions', ssoBaseUrl).toString();
  }, [ssoBaseUrl]);

  const samlCallbackUrl = React.useMemo(
    () => buildCallbackUrl(ssoBaseUrl, SSOProviderType.SAML, providerId),
    [providerId, ssoBaseUrl],
  );

  const oidcCallbackUrl = React.useMemo(
    () => buildCallbackUrl(ssoBaseUrl, SSOProviderType.OIDC, providerId),
    [providerId, ssoBaseUrl],
  );

  const authentikRedirectRegexPattern = React.useMemo(() => {
    const baseUrl = ssoBaseUrl ? escapeRegex(ssoBaseUrl) : 'http://localhost:3000';
    const id = providerId ?? 1;
    return `^${baseUrl}/api/auth/sso/OIDC/${id}/callback(\\?.*)?$`;
  }, [providerId, ssoBaseUrl]);

  const hasSetupUrls = Boolean(providerId && logoutUrls?.postLogoutUrl);

  return {
    ssoBaseUrl,
    docsSsoProvidersUrl,
    docsAuthentikPermissionsUrl,
    samlCallbackUrl,
    oidcCallbackUrl,
    authentikRedirectRegexPattern,
    hasSetupUrls,
    postLogoutUrl: logoutUrls?.postLogoutUrl ?? '',
    backchannelLogoutUrl: logoutUrls?.backchannelLogoutUrl ?? '',
    frontchannelLogoutUrl: logoutUrls?.frontchannelLogoutUrl ?? '',
    samlSloUrl: logoutUrls?.samlSloUrl ?? '',
  };
};
